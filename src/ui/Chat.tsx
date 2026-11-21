import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { api, streamChat, type ChatMessage } from "./api";

const suggestions = [
  "What does the Scrum Guide require of the Daily Scrum?",
  "A project manager runs our status meeting and assigns tasks. What should change?",
  "Where does the Expansion Pack depart from the 2020 Guide?",
];

export function Chat({
  initialId,
  onStarted,
  onConversationsChanged,
}: {
  initialId: string | null;
  onStarted: (id: string) => void;
  onConversationsChanged: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [guidanceFor, setGuidanceFor] = useState<ChatMessage | null>(null);
  const [guideTitle, setGuideTitle] = useState("");
  const [guideBody, setGuideBody] = useState("");
  const [guideStatus, setGuideStatus] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const idRef = useRef(initialId);

  useEffect(() => {
    const id = idRef.current;
    if (!id) return;
    void api.conversation(id).then((conversation) => setMessages(conversation.messages));
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, sending]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || sending) return;
    setSending(true);
    setError("");
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: question };
    const assistantId = crypto.randomUUID();
    setMessages((current) => [...current, userMessage, { id: assistantId, role: "assistant", content: "", sources: [] }]);
    setDraft("");
    try {
      await streamChat(idRef.current, question, {
        onMeta: (meta) => {
          idRef.current = meta.conversationId;
          onStarted(meta.conversationId);
          setMessages((current) =>
            current.map((message) => (message.id === assistantId ? { ...message, sources: meta.sources } : message)),
          );
          onConversationsChanged();
        },
        onDelta: (delta) => {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId ? { ...message, content: message.content + delta } : message,
            ),
          );
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMessages((current) => current.filter((message) => message.id !== assistantId || message.content));
    } finally {
      setSending(false);
    }
  }

  function openGuidance(message: ChatMessage) {
    const previousUser = [...messages].reverse().find((item) => item.role === "user");
    setGuideTitle(previousUser?.content.slice(0, 80) || "Team guidance");
    setGuideBody(message.content);
    setGuideStatus("");
    setGuidanceFor(message);
  }

  async function saveGuidance() {
    await api.createGuidance({ title: guideTitle, body: guideBody, source: "chat" });
    setGuideStatus("Saved. Later answers follow this note when it applies.");
    setGuidanceFor(null);
  }

  return (
    <>
      <div className="transcript" ref={scroller}>
        <div className="column">
          {messages.length === 0 && (
            <div className="empty">
              <h2>How should the team handle this?</h2>
              <p>Ask about the Scrum Guide, the Expansion Pack, or a situation your team is in.</p>
              <div className="suggestions">
                {suggestions.map((suggestion) => (
                  <button key={suggestion} onClick={() => void send(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message) => (
            <article className={`message ${message.role}`} key={message.id}>
              {message.role === "user" ? (
                <div className="bubble">{message.content}</div>
              ) : (
                <div>
                  {message.content ? (
                    <div className="prose body">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                  ) : (
                    sending && <p className="thinking">Thinking…</p>
                  )}
                  {message.sources && message.sources.length > 0 && (
                    <div className="sources">
                      {message.sources.map((source) => (
                        <span className="source" key={`${source.file}-${source.heading}`}>
                          {source.label}: {source.heading}
                        </span>
                      ))}
                    </div>
                  )}
                  {message.content && (
                    <div className="message-actions">
                      <button className="linkish" onClick={() => openGuidance(message)}>
                        Save as guidance
                      </button>
                    </div>
                  )}
                </div>
              )}
            </article>
          ))}
          {error && <div className="error">{error}</div>}
          {guideStatus && <p className="status">{guideStatus}</p>}
        </div>
      </div>
      <div className="composer-wrap">
        <form
          className="column composer"
          onSubmit={(event) => {
            event.preventDefault();
            void send(draft);
          }}
        >
          <textarea
            rows={1}
            placeholder="Ask about a situation, a document, or the Guide"
            aria-label="Message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(draft);
              }
            }}
          />
          <button className="send" type="submit" disabled={sending || !draft.trim()} aria-label="Send">
            ↑
          </button>
        </form>
        <p className="column hint">Enter to send. Shift+Enter for a new line. Answers follow your guidance, then the 2020 Scrum Guide, then the Expansion Pack.</p>
      </div>
      {guidanceFor && (
        <div className="modal-back" role="presentation" onClick={() => setGuidanceFor(null)}>
          <form
            className="modal-card"
            role="dialog"
            aria-label="Save guidance"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void saveGuidance();
            }}
          >
            <h2>Save as guidance</h2>
            <p className="lede">This note outranks the Scrum Guide and the Expansion Pack when it applies.</p>
            <label>
              Title
              <input value={guideTitle} onChange={(event) => setGuideTitle(event.target.value)} />
            </label>
            <label>
              Guidance
              <textarea className="field" value={guideBody} onChange={(event) => setGuideBody(event.target.value)} />
            </label>
            <div className="row">
              <button className="primary" type="submit">
                Save
              </button>
              <button className="secondary" type="button" onClick={() => setGuidanceFor(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
