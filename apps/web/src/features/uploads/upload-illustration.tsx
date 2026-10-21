// A marshmallow with a little waveform beside it, drawn in ink on a lavender blob.
export function UploadIllustration() {
  return (
    <div
      aria-hidden="true"
      className="flex size-28 items-center justify-center rounded-[46%_54%_52%_48%/55%_45%_55%_45%] bg-tint-lavender sm:size-32"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 80 64"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-16 w-20 text-foreground sm:h-18 sm:w-22"
      >
        <ellipse cx="26" cy="18" rx="16" ry="6" className="fill-card" />
        <path
          d="M10 18v24c0 3.3 7.2 6 16 6s16-2.7 16-6V18"
          className="fill-card"
        />
        <ellipse cx="26" cy="18" rx="16" ry="6" />
        <path d="M20 31.5h.01M32 31.5h.01" strokeWidth={3.5} />
        <path d="M22.5 37c2 1.6 5 1.6 7 0" />
        <path d="M52 30v6M58 24v18M64 28v10M70 21v24M76 29v8" />
      </svg>
    </div>
  )
}
