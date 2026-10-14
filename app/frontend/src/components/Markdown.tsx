import { Fragment, ReactNode } from 'react';

/** Minimal renderer for Genie's answer text: paragraphs, "- " bullets, **bold** and `code`. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="px-1 rounded bg-white/70 text-[0.85em]">{part.slice(1, -1)}</code>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export default function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={blocks.length} className="list-disc pl-5 space-y-0.5">
          {bullets.map((b, i) => <li key={i}>{inline(b)}</li>)}
        </ul>,
      );
      bullets = [];
    }
  };
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (/^[-*] /.test(t)) bullets.push(t.slice(2));
    else {
      flush();
      if (t) blocks.push(<p key={blocks.length}>{inline(t)}</p>);
    }
  }
  flush();
  return <div className="space-y-2">{blocks}</div>;
}
