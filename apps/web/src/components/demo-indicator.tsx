export function DemoIndicator({ className }: { className?: string }) {
  return (
    <span className={className} data-demo-indicator title="Demo. Changes reset when you reload.">
      Demo
      <span className="sr-only">. Changes reset when you reload.</span>
    </span>
  );
}
