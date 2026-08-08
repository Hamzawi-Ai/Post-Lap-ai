/**
 * PostLab persona — re-export only.
 *
 * The authoritative PostLab identity lives in `services/ai/postlabPersona.ts`
 * (POSTLAB_IDENTITY, created by Task #42). This module intentionally contains
 * NO duplicate identity text. It exists so the PostLab Brain layer exposes a
 * single, stable reference to the persona without callers reaching into the
 * legacy file path.
 *
 * Rule: there must be exactly ONE authoritative PostLab identity string.
 * Edit `postlabPersona.ts` to change the persona — never this file.
 */
export { POSTLAB_IDENTITY as POSTLAB_PERSONA } from "../postlabPersona";
