import { useCallback, useEffect, useState } from "react";
import { api, type ConversationSummary } from "./api";
import { Chat } from "./Chat";
import { Guidance } from "./Guidance";
import { Review } from "./Review";
import { Settings } from "./Settings";

type View = "chat" | "review" | "guidance" | "settings";

export function App() {
  const [view, setView] = useState<View>("chat");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [navNonce, setNavNonce] = useState(0);

  const refresh = useCallback(async () => {
    setConversations(await api.conversations());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function removeConversation(id: string) {
    await api.deleteConversation(id);
    if (activeId === id) setActiveId(null);
    await refresh();
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="mark">S</div>
          <h1>Scrum Coach</h1>
        </div>
        <button
          className="new-chat"
          onClick={() => {
            setActiveId(null);
            setNavNonce((value) => value + 1);
            setView("chat");
          }}
        >
          New chat
        </button>
        <div className="recents">
          {conversations.map((conversation) => (
            <div className="chat-row" key={conversation.id}>
              <button
                className={`chat-item${view === "chat" && activeId === conversation.id ? " active" : ""}`}
                onClick={() => {
                  setActiveId(conversation.id);
                  setNavNonce((value) => value + 1);
                  setView("chat");
                }}
              >
                {conversation.title}
              </button>
              <button className="icon-button" aria-label="Delete chat" onClick={() => void removeConversation(conversation.id)}>
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="nav-block">
          <button className={`nav${view === "review" ? " active" : ""}`} onClick={() => setView("review")}>
            Review a document
          </button>
          <button className={`nav${view === "guidance" ? " active" : ""}`} onClick={() => setView("guidance")}>
            Guidance
          </button>
          <button className={`nav${view === "settings" ? " active" : ""}`} onClick={() => setView("settings")}>
            Settings
          </button>
        </div>
        <p className="sidebar-foot">
          Scrum Guide © 2020 Ken Schwaber and Jeff Sutherland, CC BY-SA 4.0. Expansion Pack © Ralph Jocham, John Coleman,
          and Jeff Sutherland, CC BY-SA 4.0.
        </p>
      </aside>
      <main className="main">
        {view === "chat" && (
          <Chat
            key={navNonce}
            initialId={activeId}
            onStarted={setActiveId}
            onConversationsChanged={() => void refresh()}
          />
        )}
        {view === "review" && <Review />}
        {view === "guidance" && <Guidance />}
        {view === "settings" && <Settings />}
      </main>
    </div>
  );
}
