"use client";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-xl bg-gold-600 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-gold-500 print:hidden"
    >
      Print
    </button>
  );
}
