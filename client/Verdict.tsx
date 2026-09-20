import { reviewLabels, verdictWords } from "./labels";

/** A block that reads from across a room; the shape repeats what the colour says. */
export default function Verdict({ status }: { status: string }) {
  return (
    <p className={`verdict ${status}`}>
      <span className="mark" aria-hidden="true" />
      <strong>{verdictWords[status]}</strong>
      <span>{reviewLabels[status]}</span>
    </p>
  );
}
