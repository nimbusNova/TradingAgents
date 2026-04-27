import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const PACKS: Record<string, { priceEnv: string; credits: number }> = {
  "5":  { priceEnv: "STRIPE_PRICE_5",  credits: 5  },
  "10": { priceEnv: "STRIPE_PRICE_10", credits: 10 },
  "25": { priceEnv: "STRIPE_PRICE_25", credits: 25 },
};

export async function POST(request: Request) {
  const { pack } = await request.json();
  const packConfig = PACKS[pack as string];
  if (!packConfig) {
    return Response.json({ error: "Invalid pack" }, { status: 400 });
  }

  // Get authenticated user
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  // Upsert Stripe customer
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  );

  let stripeCustomerId: string;
  const { data: existing } = await admin
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .single();

  if (existing) {
    stripeCustomerId = existing.stripe_customer_id;
  } else {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { user_id: user.id },
    });
    await admin.from("stripe_customers").insert({
      user_id: user.id,
      stripe_customer_id: customer.id,
    });
    stripeCustomerId = customer.id;
  }

  const origin = request.headers.get("origin") ?? "http://localhost:3001";
  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    line_items: [{ price: process.env[packConfig.priceEnv]!, quantity: 1 }],
    mode: "payment",
    success_url: `${origin}/billing?success=1`,
    cancel_url: `${origin}/billing`,
    metadata: {
      user_id: user.id,
      credits: String(packConfig.credits),
    },
  });

  return Response.json({ url: session.url });
}
