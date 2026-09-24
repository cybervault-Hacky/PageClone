export interface StatusNoteProps {
  readonly text: string | null;
}

/** Live-region note beneath the primary action (announces state changes). */
export function StatusNote({ text }: StatusNoteProps) {
  return (
    <p className="note" role="status">
      {text ?? ''}
    </p>
  );
}
