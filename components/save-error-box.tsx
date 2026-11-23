/** Red box above the form buttons for a failed save (lines from saveErrorLines()). */
export function SaveErrorBox({ lines }: { lines: string[] | null }) {
  if (!lines || lines.length === 0) return null;
  return (
    <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <p className="font-medium">{lines[0]}</p>
      {lines.length > 1 && (
        <ul className="mt-1 list-disc pl-5">
          {lines.slice(1).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
