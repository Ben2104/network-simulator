import { type FormEvent } from 'react';

type SendBarProps = {
  message: string;
  maxLength: number;
  onMessageChange: (message: string) => void;
  onSend: () => void;
  disabled?: boolean;
  sending?: boolean;
  locked?: boolean;
};

export function SendBar({
  message,
  maxLength,
  onMessageChange,
  onSend,
  disabled = false,
  sending = false,
  locked = false,
}: SendBarProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!disabled && !locked && !sending && message.trim()) onSend();
  };

  const sendDisabled = disabled || locked || sending || !message.trim();

  return (
    <form className="panel send-bar" onSubmit={submit}>
      <label htmlFor="message">Message</label>
      <input
        id="message"
        value={message}
        maxLength={maxLength}
        onChange={(event) => onMessageChange(event.target.value)}
        aria-describedby="message-count"
        required
      />
      <span id="message-count" className="character-count" aria-live="polite">
        {message.length}/{maxLength}
      </span>
      <button type="submit" disabled={sendDisabled}>
        {sending ? 'Sending…' : 'Send'}
      </button>
      {locked && (
        <p className="locked-hint" role="status">
          <span aria-hidden="true">🔒</span> Locked while sending
        </p>
      )}
    </form>
  );
}
