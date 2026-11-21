# Scrum Coach

Scrum Coach is a local web app. It answers questions and reviews process documents from three sources, in this order:

1. Your guidance notes.
2. The Scrum Guide (November 2020).
3. The Scrum Guide Expansion Pack and its extension guides.

The model only sees the passages the app retrieves. Switching providers does not change those documents.

The app listens on this computer only, at http://127.0.0.1:3920.

## Set up a new computer

1. Install [Node.js](https://nodejs.org/) 20 or newer.
2. Clone this repository and open a terminal in the project folder.
3. Run `npm install`.
4. Choose a model provider. Ollama is the default and needs no API key. Anthropic, Gemini, and any OpenAI-compatible server (such as Open WebUI) are configured on the Settings page.
5. Run `npm run dev`.
6. Open http://127.0.0.1:3920.
7. Open Settings and use **Test active provider** before you rely on an answer.

`npm start` builds the page and serves it without the dev server. Use that when you want the app to stay up without file watching.

Settings, chat history, and review history are stored in `data/` on that computer. They are not part of the git repository. Copy `knowledge/guidance/` if you want the same local Scrum decisions on another machine.

## Ollama

Install Ollama from https://ollama.com, then pull a model. The folder you run the pull from does not matter. Ollama stores the model in its own data directory.

```bash
ollama pull qwen2.5:7b
```

In Settings, leave the base URL as `http://127.0.0.1:11434/v1` and the model as `qwen2.5:7b`. The base URL includes `/v1`.

**Use the GPU when this machine has one** is on by default. Ollama puts the model on the GPU when its process can see one. **Test active provider** reports whether the loaded model is on the GPU or the CPU. Clear the box to keep the model on the CPU.

To try another local model, pull it and change the model name in Settings. For example:

```bash
ollama pull gemma4:e4b
```

Then set the model to `gemma4:e4b` and save. `gemma4:12b` is a stronger option when the GPU has room for it.

### Ollama inside WSL2

The Windows app can call Ollama running in WSL2.

```bash
sudo snap install ollama
ollama pull qwen2.5:7b
sudo snap set ollama host=0.0.0.0:11434
```

The snap starts the server itself. A second `ollama serve` fails because port 11434 is already in use, and the snap ignores `OLLAMA_HOST` typed in front of a command. `snap set` is what changes the listen address, and it restarts the service.

From Windows, open http://127.0.0.1:11434. If that responds, the Settings base URL can stay `http://127.0.0.1:11434/v1`. If it does not, run `wsl hostname -I` in Windows and set the base URL to `http://<that address>:11434/v1`.

A snap inside WSL sometimes cannot see the GPU even when Windows has one. The test on the Settings page says so. A native Ollama install on Windows is the straightforward way to use that GPU.

### Ollama on Linux or macOS

The install script starts a background service, so you do not need to run `ollama serve` yourself. On Linux, set the listen address with a systemd drop-in when another computer must reach it:

```bash
sudo systemctl edit ollama
```

Add this, then run `sudo systemctl daemon-reload` and `sudo systemctl restart ollama`:

```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
```

## Cloud and other servers

On the Settings page, choose one provider and fill in its fields.

| Provider | What to enter |
| --- | --- |
| Anthropic | API key and model, default `claude-sonnet-5-5` |
| Gemini | API key and model, default `gemini-4-hydrogen` |
| OpenAI-compatible | Base URL ending in `/v1`, API key if the server requires one, and the model name |

Open WebUI and similar local servers use the OpenAI-compatible row. Save, then test.

## Use the coach

- Chat answers a question or a situation and shows the passages it used.
- **Save as guidance** keeps an answer, after you edit it, as a note that later answers follow.
- The Guidance page is the same library. Edit the notes there, or add Markdown files under `knowledge/guidance/`.
- Review a document accepts pasted text, a `.docx`, `.md`, `.txt`, or `.html` file, or a web page address. Files need to be under 2 MB.
- Finished reviews stay on that page, with the time and the model that wrote them.

## Connect Cursor or Claude Desktop

Leave `npm run dev` or `npm start` running.

- MCP endpoint: `http://127.0.0.1:3920/mcp`
- OpenAI-compatible base URL: `http://127.0.0.1:3920/v1`

Cursor `mcp.json`:

```json
{
  "mcpServers": {
    "scrum-coach": {
      "url": "http://127.0.0.1:3920/mcp"
    }
  }
}
```

Tools:

- `ask_scrum` — the configured model answers from the library.
- `review_document` — compare process text with the library.
- `search_knowledge` — return passages only.
- `save_guidance` — store a local decision that later answers follow.

Claude Desktop can use the same MCP URL. For a stdio launch that does not need the web server, point `cwd` at the cloned project folder:

```json
{
  "mcpServers": {
    "scrum-coach": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/path/to/scrum-coach"
    }
  }
}
```

If you set a bearer token in Settings, send it as `Authorization: Bearer <token>` on `/v1` and `/mcp`. The chat page on this computer does not use that token. Leave the token empty when only this computer calls the app.

## Refresh the Scrum library

The Guide and Expansion Pack already ship in `knowledge/`. To download a newer Expansion Pack from GitHub:

```bash
npm run fetch-knowledge
```

That rewrites `knowledge/scrum-guide/` and `knowledge/expansion/`. It does not touch `knowledge/guidance/`.

## Another agent later

`agents/scrum-coach.json` points at the instructions file and the document folders. A second agent is a second config file with its own instructions and folders. The app currently loads `agents/scrum-coach.json`.

## Licenses

See `knowledge/ATTRIBUTION.md`. The Scrum Guide and the Expansion Pack are CC BY-SA 4.0. Keep their attribution if you share the knowledge files.
