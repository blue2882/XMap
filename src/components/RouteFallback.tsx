export function RouteFallback() {
  return (
    <div className="flex h-dvh items-center justify-center p-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-raised px-6 py-5 shadow-float">
        <p className="type-title">Loading workspace</p>
        <div className="h-1.5 w-48 overflow-hidden rounded-full bg-line">
          <i className="block h-full w-[30%] rounded-full bg-(--color-branch-0) animate-busy-slide" />
        </div>
      </div>
    </div>
  );
}
