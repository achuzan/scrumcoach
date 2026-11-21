import { useEffect, useState } from "react";
import { api, type ReviewResponse, type ReviewSummary } from "./api";

type Mode = "paste" | "file" | "url";

export function Review() {
  const [mode, setMode] = useState<Mode>("paste");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReviewResponse | null>(null);
  const [history, setHistory] = useState<ReviewSummary[]>([]);

  async function refreshHistory() {
    setHistory(await api.reviews());
  }

  useEffect(() => {
    void refreshHistory().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  async function run() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      if (mode === "file") {
        if (!file) throw new Error("Choose a Word, Markdown, text, or HTML file.");
        setResult(await api.reviewFile(file));
      } else if (mode === "url") {
        setResult(await api.review({ url }));
      } else {
        setResult(await api.review({ text }));
      }
      await refreshHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="column stack">
        <div>
          <h2>Review a document</h2>
          <p className="lede">
            Paste a process, drop a file, or give a page address. Scrum Coach compares it with your guidance, the 2020
            Scrum Guide, and the Expansion Pack. Finished reviews stay in the list below.
          </p>
        </div>
        {history.length > 0 && (
          <div className="note-list">
            {history.map((item) => (
              <div className="chat-row" key={item.id}>
                <button
                  className={result?.id === item.id ? "active" : ""}
                  onClick={() => {
                    void api.reviewRecord(item.id).then(setResult).catch((err: unknown) => {
                      setError(err instanceof Error ? err.message : String(err));
                    });
                  }}
                >
                  {item.title}
                  <small>
                    {new Date(item.createdAt).toLocaleString()} · {item.model}
                  </small>
                </button>
                <button
                  className="icon-button"
                  aria-label="Delete review"
                  onClick={() => {
                    void api.deleteReview(item.id).then(async () => {
                      if (result?.id === item.id) setResult(null);
                      await refreshHistory();
                    });
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="segmented">
          {(
            [
              ["paste", "Paste"],
              ["file", "File"],
              ["url", "Web page"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} className={mode === id ? "active" : ""} onClick={() => setMode(id)}>
              {label}
            </button>
          ))}
        </div>
        {mode === "paste" && (
          <textarea
            className="field"
            placeholder="Paste the procedure or working agreement"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        )}
        {mode === "file" && (
          <label>
            Document
            <input
              type="file"
              accept=".docx,.md,.markdown,.txt,.html,.htm,text/plain,text/markdown,text/html"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
        )}
        {mode === "url" && (
          <label>
            Page address
            <input type="url" placeholder="https://example.com/working-agreement" value={url} onChange={(event) => setUrl(event.target.value)} />
          </label>
        )}
        <div>
          <button className="primary" disabled={busy} onClick={() => void run()}>
            {busy ? "Reviewing…" : "Check against Scrum"}
          </button>
        </div>
        {error && <div className="error">{error}</div>}
        {result && (
          <div className="stack">
            <article className="card">
              <div className="label">
                {new Date(result.createdAt).toLocaleString()} · {result.model}
              </div>
              <p>{result.summary}</p>
              {result.excerpt && (
                <>
                  <div className="label">Opening of the document</div>
                  <p className="quote">{result.excerpt}</p>
                </>
              )}
              {result.sources.length > 0 && (
                <div className="sources">
                  {result.sources.map((source) => (
                    <span className="source" key={`${source.file}-${source.heading}`}>
                      {source.label}: {source.heading}
                    </span>
                  ))}
                </div>
              )}
            </article>
            {result.findings.length === 0 ? (
              <p className="status">No separate findings were listed.</p>
            ) : (
              result.findings.map((finding, index) => (
                <article className="finding" key={`${finding.quote}-${index}`}>
                  <h3>Finding {index + 1}</h3>
                  {finding.quote && (
                    <>
                      <div className="label">From the document</div>
                      <p className="quote">{finding.quote}</p>
                    </>
                  )}
                  <div className="label">What does not align</div>
                  <p>{finding.issue}</p>
                  {finding.source && (
                    <>
                      <div className="label">Source</div>
                      <p>{finding.source}</p>
                    </>
                  )}
                  <div className="label">A closer alignment</div>
                  <p>{finding.suggestion}</p>
                </article>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
