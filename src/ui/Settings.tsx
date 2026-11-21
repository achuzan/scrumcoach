import { useEffect, useState } from "react";
import { api, type Settings as SettingsShape } from "./api";

const names = [
  ["ollama", "Ollama"],
  ["anthropic", "Anthropic"],
  ["gemini", "Gemini"],
  ["openai-compatible", "OpenAI-compatible"],
] as const;

export function Settings() {
  const [settings, setSettings] = useState<SettingsShape | null>(null);
  const [info, setInfo] = useState<{ openai: string; mcp: string } | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.all([api.settings(), api.info()])
      .then(([next, about]) => {
        setSettings(next);
        setInfo(about);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (!settings) {
    return (
      <div className="page">
        <div className="column">{error ? <div className="error">{error}</div> : <p className="thinking">Loading settings…</p>}</div>
      </div>
    );
  }

  async function save() {
    if (!settings) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      setSettings(await api.saveSettings(settings));
      setStatus("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (!settings) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await api.saveSettings(settings);
      const result = await api.testSettings();
      setStatus(`Connected. The model replied: ${result.text}`);
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
          <h2>Settings</h2>
          <p className="lede">
            Choose the model that answers. The Scrum Guide, the Expansion Pack, and your guidance stay in the document
            folders, so switching providers does not change the source of the answers.
          </p>
        </div>
        {error && <div className="error">{error}</div>}
        {status && <p className="status">{status}</p>}
        <div className="providers">
          {names.map(([id, label]) => (
            <section className={`provider${settings.activeProvider === id ? " active" : ""}`} key={id}>
              <header>
                <h3>{label}</h3>
                <label className="choice">
                  <input
                    type="radio"
                    name="provider"
                    checked={settings.activeProvider === id}
                    onChange={() => setSettings({ ...settings, activeProvider: id })}
                  />
                  Active
                </label>
              </header>
              {id === "ollama" && (
                <>
                  <label>
                    Base URL, including /v1
                    <input
                      value={settings.providers.ollama.baseURL}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          providers: { ...settings.providers, ollama: { ...settings.providers.ollama, baseURL: event.target.value } },
                        })
                      }
                    />
                  </label>
                  <label>
                    Model
                    <input
                      value={settings.providers.ollama.model}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          providers: { ...settings.providers, ollama: { ...settings.providers.ollama, model: event.target.value } },
                        })
                      }
                    />
                  </label>
                  <label className="choice">
                    <input
                      type="checkbox"
                      checked={settings.providers.ollama.useGpu}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          providers: {
                            ...settings.providers,
                            ollama: { ...settings.providers.ollama, useGpu: event.target.checked },
                          },
                        })
                      }
                    />
                    Use the GPU when this machine has one
                  </label>
                </>
              )}
              {id === "anthropic" && (
                <>
                  <label>
                    API key
                    <input
                      type="password"
                      value={settings.providers.anthropic.apiKey}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          providers: {
                            ...settings.providers,
                            anthropic: { ...settings.providers.anthropic, apiKey: event.target.value },
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Model
                    <input
                      value={settings.providers.anthropic.model}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          providers: {
                            ...settings.providers,
                            anthropic: { ...settings.providers.anthropic, model: event.target.value },
                          },
                        })
                      }
                    />
                  </label>
                </>
              )}
              {id === "gemini" && (
                <>
                  <label>
                    API key
                    <input
                      type="password"
                      value={settings.providers.gemini.apiKey}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          providers: { ...settings.providers, gemini: { ...settings.providers.gemini, apiKey: event.target.value } },
                        })
                      }
                    />
                  </label>
                  <label>
                    Model
                    <input
                      value={settings.providers.gemini.model}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          providers: { ...settings.providers, gemini: { ...settings.providers.gemini, model: event.target.value } },
                        })
                      }
                    />
                  </label>
                </>
              )}
              {id === "openai-compatible" && (
                <>
                  <label>
                    Base URL, including /v1
                    <input
                      value={settings.providers["openai-compatible"].baseURL}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          providers: {
                            ...settings.providers,
                            "openai-compatible": { ...settings.providers["openai-compatible"], baseURL: event.target.value },
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    API key
                    <input
                      type="password"
                      value={settings.providers["openai-compatible"].apiKey}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          providers: {
                            ...settings.providers,
                            "openai-compatible": { ...settings.providers["openai-compatible"], apiKey: event.target.value },
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Model
                    <input
                      value={settings.providers["openai-compatible"].model}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          providers: {
                            ...settings.providers,
                            "openai-compatible": { ...settings.providers["openai-compatible"], model: event.target.value },
                          },
                        })
                      }
                    />
                  </label>
                </>
              )}
            </section>
          ))}
        </div>
        <label>
          Bearer token for /v1 and /mcp
          <input
            type="password"
            value={settings.bearerToken}
            placeholder="Leave empty while you use this computer only"
            onChange={(event) => setSettings({ ...settings, bearerToken: event.target.value })}
          />
        </label>
        <div className="row">
          <button className="primary" disabled={busy} onClick={() => void save()}>
            Save
          </button>
          <button className="secondary" disabled={busy} onClick={() => void test()}>
            Test active provider
          </button>
        </div>
        {info && (
          <article className="card stack">
            <div>
              <div className="label">OpenAI-compatible base URL</div>
              <div className="code">{info.openai}</div>
            </div>
            <div>
              <div className="label">MCP endpoint</div>
              <div className="code">{info.mcp}</div>
            </div>
            <p className="lede">
              Point Cursor or Claude Desktop at the MCP endpoint while this app is running. A stdio command is also
              available: npm run mcp
            </p>
          </article>
        )}
      </div>
    </div>
  );
}
