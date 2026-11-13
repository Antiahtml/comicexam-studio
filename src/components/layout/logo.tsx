import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-8", className)} aria-hidden>
      <rect width="64" height="64" rx="14" fill="#4f46e5" />
      <path d="M14 16h36a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H30l-10 8v-8h-6a4 4 0 0 1-4-4V20a4 4 0 0 1 4-4z" fill="#fff" />
      <path d="M22 29l6 6 14-13" fill="none" stroke="#f59e0b" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-[15px] font-bold tracking-tight">
        ComicExam <span className="text-primary">Studio</span>
      </span>
    </span>
  );
}
