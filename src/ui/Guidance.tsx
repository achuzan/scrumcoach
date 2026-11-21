import { useEffect, useState } from "react";
import { api, type GuidanceNote } from "./api";

const blank = { title: "", body: "" };

export function Guidance() {
  const [notes, setNotes] = useState<GuidanceNote[]>([]);
  const [selected, setSelected] = useState<string | "new">("new");
  const [draft, setDraft] = useState(blank);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  async function load(keepId?: string) {
    const next = await api.guidance();
    setNotes(next);
    if (keepId && next.some((note) => note.id === keepId)) {
      const note = next.find((item) => item.id === keepId)!;
      setSelected(note.id);
      setDraft({ title: note.title, body: note.body });
    }
  }

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  function choose(note: GuidanceNote) {
    setSelected(note.id);
    setDraft({ title: note.title, body: note.body });
    setStatus("");
    setError("");
  }

  async function save() {
    setError("");
    setStatus("");
    try {
      if (selected === "new") {
        const note = await api.createGuidance({ ...draft, source: "manual" });
        await load(note.id);
        setStatus("Saved. The coach will use this note on later answers.");
      } else {
        await api.updateGuidance(selected, draft);
        await load(selected);
        setStatus("Updated.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function remove() {
    if (selected === "new") return;
    await api.deleteGuidance(selected);
    setSelected("new");
    setDraft(blank);
    setStatus("Deleted.");
    await load();
  }

  return (
    <div className="page">
      <div className="column">
        <h2>Guidance</h2>
        <p className="lede">
          Write the clarifications and local decisions that should outrank the published Scrum Guide and the Expansion
          Pack.
        </p>
        {error && <div className="error">{error}</div>}
        {status && <p className="status">{status}</p>}
        <div className="guidance-layout">
          <div className="note-list">
            <button
              className={selected === "new" ? "active" : ""}
              onClick={() => {
                setSelected("new");
                setDraft(blank);
                setStatus("");
              }}
            >
              New note
            </button>
            {notes.map((note) => (
              <button key={note.id} className={selected === note.id ? "active" : ""} onClick={() => choose(note)}>
                {note.title}
                <small>{note.source === "chat" ? "Saved from chat" : "Written here"}</small>
              </button>
            ))}
          </div>
          <form
            className="note-editor stack"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label>
              Title
              <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            </label>
            <label>
              What the coach should follow
              <textarea className="field" value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} />
            </label>
            <div className="row">
              <button className="primary" type="submit">
                Save
              </button>
              {selected !== "new" && (
                <button className="secondary" type="button" onClick={() => void remove()}>
                  Delete
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
