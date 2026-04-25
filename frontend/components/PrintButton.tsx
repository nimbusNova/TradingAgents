"use client";
export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="px-3 py-1.5 border border-gray-700 rounded text-sm text-gray-300 hover:bg-gray-800 transition-colors"
    >
      Print
    </button>
  );
}
