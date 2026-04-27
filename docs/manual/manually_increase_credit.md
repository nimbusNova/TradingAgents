# Manually Increasing a User's Credits

Credits are stored as a ledger in the `public.credits` table. The balance is calculated on the fly as `SUM(delta)` — there is no single balance column to update. Adding credits means inserting a new row with a positive `delta`.

All queries below run in the **Supabase Dashboard → SQL Editor**.

---

## 1. Add Credits (by email)

```sql
INSERT INTO public.credits (user_id, delta, reason)
SELECT id, 10, 'admin_adjustment'
FROM auth.users
WHERE email = 'user@example.com';
```

- Replace `10` with the number of credits to add
- Replace `'user@example.com'` with the target user's email
- `admin_adjustment` is the correct reason value for manual top-ups

---

## 2. Check a User's Available Balance (by email)

```sql
SELECT
  u.email,
  COALESCE(SUM(c.delta), 0) AS balance
FROM auth.users u
LEFT JOIN public.credits c ON c.user_id = u.id
WHERE u.email = 'user@example.com'
GROUP BY u.email;
```

- Replace `'user@example.com'` with the target user's email
- Returns `0` if the user has no credit rows yet

---

## Notes

- **1 credit = 1 run** — each completed run deducts exactly 1 credit
- New accounts automatically receive 1 free credit on email confirmation (database trigger)
- Stripe purchases also write to this same table with `reason = 'purchase'`
- There is no admin UI or backend endpoint for manual adjustments — the SQL Editor is the only method
