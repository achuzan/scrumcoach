import fs from "node:fs";
import path from "node:path";
import { rootDir } from "./paths.js";

export interface DocumentSet {
  id: string;
  path: string;
  authority: number;
  label: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  instructions: string;
  documents: DocumentSet[];
}

export function loadAgent() {
  const configPath = path.join(rootDir, "agents", "scrum-coach.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as AgentConfig;
  const instructions = fs.readFileSync(path.join(rootDir, config.instructions), "utf8");
  return { config, instructions };
}
