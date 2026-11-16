import { FormEvent, useState } from 'react';
import { Check, Loader2, Send, ThumbsDown, ThumbsUp } from 'lucide-react';
import { apiClient, FeedbackRating, ModelKey } from '../lib/api';

interface Props {
  model: ModelKey;
  conversationId: string;
  messageId: string;
}

/** Thumbs up/down and an optional comment on one Genie answer, sent to the agent's feedback API as the viewer. */
export default function Feedback({ model, conversationId, messageId }: Props) {
  const [rating, setRating] = useState<FeedbackRating>('NONE');
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  const send = async (r: FeedbackRating, c?: string) => {
    setState('saving');
    try {
      await apiClient.sendFeedback({ model, conversation_id: conversationId, message_id: messageId, rating: r, comment: c });
      setState(c ? 'sent' : 'idle');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState('error');
      return false;
    }
  };

  // Clicking the selected thumb again clears the rating.
  const rate = async (r: FeedbackRating) => {
    const prev = rating;
    const next = rating === r ? 'NONE' : r;
    setRating(next);
    if (await send(next)) setOpen(next !== 'NONE');
    else setRating(prev);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = comment.trim();
    if (!text) return;
    if (await send(rating, text)) {
      setOpen(false);
      setComment('');
    }
  };

  const thumb = (r: FeedbackRating, Icon: typeof ThumbsUp, label: string) => (
    <button
      title={label}
      aria-label={label}
      aria-pressed={rating === r}
      disabled={state === 'saving'}
      onClick={() => rate(r)}
      className={`p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-50 ${rating === r ? 'text-wyndham-blue' : 'text-text-tertiary'}`}
    >
      <Icon className="w-4 h-4" fill={rating === r ? 'currentColor' : 'none'} />
    </button>
  );

  return (
    <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
      {open && (
        <form onSubmit={submit} className="flex items-center gap-1.5">
          <input
            value={comment}
            onChange={e => setComment(e.target.value)}
            maxLength={2000}
            autoFocus
            placeholder={rating === 'NEGATIVE' ? 'What was wrong? (optional)' : 'Anything to add? (optional)'}
            className="w-64 text-xs px-3 py-1.5 rounded-xl border border-gray-200 outline-none focus:border-wyndham-blue"
          />
          <button type="submit" disabled={!comment.trim() || state === 'saving'} title="Send comment" className="p-1.5 rounded-lg bg-wyndham-blue text-white disabled:opacity-50">
            {state === 'saving' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </form>
      )}
      {state === 'sent' && (
        <span className="inline-flex items-center gap-1 text-[11px] text-green-700">
          <Check className="w-3.5 h-3.5" />
          Sent to Genie
        </span>
      )}
      {state === 'error' && <span className="text-[11px] text-red-600" title={error}>Feedback not sent</span>}
      <div className="flex items-center gap-0.5">
        {thumb('POSITIVE', ThumbsUp, 'Good answer')}
        {thumb('NEGATIVE', ThumbsDown, 'Bad answer')}
      </div>
    </div>
  );
}
