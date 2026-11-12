// What the editor offers for a sentence that does not read (assistCandidates, 09-editor-search.ts): what the sentence is
// read as, what it means, and the near sentences found for it. Types only; the product holds none of this.
import type { Hint, SearchIntent } from './editor.d.ts';
import type { ParseContext } from './parse.d.ts';
import type { EventName } from './project.d.ts';
import type { ActorRef, Heading } from './syntax-base.d.ts';
import type { Script } from './syntax.d.ts';

// Where the near sentences are looked for: the source's context as the reader reads it, the level of the editor, the
// signal names of the work, and whether a body is written after the line (an empty text when the next line is empty).
export type AssistContext = ParseContext & {
  level?: string; signalNames?: { sent: string[]; received: string[] }; assistExistingBody?: string | boolean;
};
// Where the sentence that does not read is (assistSourceRange): its place in the source, its line's start and end, the
// line's indent and number, and its text.
export interface AssistRange { start: number; end: number; lineStart: number; lineEnd: number; indent: number; line: number; text: string }
// A sentence read and written as the code writes it (assistCanonical).
export interface AssistCanonical { text: string; ast: Script }

// A name written that the work has (assistSeeds): a part, a sound, a backdrop, a costume of the part, a variable or a
// list, a made block, an argument or a local of the body.
export type AssistNameKind = 'part' | 'sound' | 'backdrop' | 'costume' | 'variable' | 'list' | 'action' | 'function' | 'argument' | 'local';
export interface AssistName { name: string; kind: AssistNameKind }
// A piece of a text cut at its separators (assistSplit), and where it is in the text.
export interface AssistPiece { text: string; start: number; end: number }
// A quoted text written and where its quote is; a number written, its unit when one is written, and where its digits are.
export interface AssistQuote { value: string; at: number; end: number }
export interface AssistNumber { value: number; unit: string | null; at: number; end: number }
// A word the search looks for: its rank (0 the whole text, 1 the last clause, then the others in order from 2), and
// whether it is a word cut from the text (fragment).
export interface AssistSeed { text: string; rank: number; fragment: boolean }
// Parts written together as the subject (assistListedSubjects): the parts, how they are written (は, or を／に for parts
// made to do it) and what they do (null when only a later clause writes them).
export interface AssistListed { parts: string[]; particle: string; rest: string | null }
// What a sentence that does not read is read as (assistSeeds): its text after the subject, the subject written, the
// quoted texts, the names, numbers and keys written, its clauses, the words to search, the event of a heading it
// writes, and the parts written together as its subject.
export interface AssistData {
  text: string; subject: string | null; strings: string[]; stringValues: AssistQuote[]; names: AssistName[];
  numbers: AssistNumber[]; keys: string[]; clauses: AssistPiece[]; seeds: AssistSeed[]; headerEvent: EventName | null;
  subjects: AssistListed | null;
}

// A number of a meaning: its unit, its value and its role (its unit, wait, during, or unknown: a time that may be
// either); kept: a time already matched as a wait before the action.
export interface AssistQuantity { unit: string; value: number; role: string; kept?: boolean }
// The meaning of one thing a written sentence does (assistMeaningFrames): the action, whether its end says it
// (stated), who does it and whether that is written, its ways, numbers, quoted texts and the names among them, the
// clause, whether a copy and a quote are written, the parts acted on, and whether it tells a part (犬に「やあ」と言う).
// A wait read before an action has only the roles.
export interface AssistWant {
  action: string | null; stated?: boolean; subject: string | null; written: boolean; directions: string[];
  quantities: AssistQuantity[]; strings: string[]; names?: string[]; raw?: string; copy?: boolean; quoted?: boolean;
  objects: (string | null)[]; tell?: boolean;
}
// The meaning of one sentence of a candidate (assistAstFrames): the action, who does it, its way, whether it goes a way
// and whether it is a command to the whole work, whether it makes a copy, its numbers, its texts and those said, the
// parts acted on, and whether it names who does it.
export interface AssistGot {
  action: string | null; subject: string | null; direction: string | null | undefined; ways: boolean; whole: boolean;
  creates: boolean; quantities: AssistQuantity[]; strings: string[]; said: string[]; objects: (string | null)[]; explicit: boolean;
}
// A node of a syntax tree as the checks of a candidate read it (assistNodes, assistCandidates): its kind, and the members
// they read (any of them may be there).
export type AssistNode = {
  kind: string; op?: string; name?: string; binder?: string; heading?: Heading; value?: { value?: unknown }; target?: { name?: string };
  actorRef?: ActorRef; args?: ({ kind?: string; value?: unknown } | undefined)[]; [key: string]: unknown;
};
// How a candidate keeps the meaning written (assistMeaningMatch): the roles it leaves out, whether it names each subject
// as written, whether it keeps only names in the work, and the actions of a meaning with no action read.
export interface AssistMeaning { missing: number; explicit: boolean; nameOnly?: boolean; actions?: string }

// A hint the search looks at: a hint of the editor, or a heading made for the sentence (assistHeadings), with the words
// it is found by (read only).
export type AssistHint = Pick<Hint, 'id' | 'text' | 'mode' | 'enabled'> & Partial<Pick<Hint, 'binding' | 'category' | 'reason' | 'searchTerms'>> & {
  terms: { readonly [K in keyof Hint['terms']]: readonly string[] };
};
// A hint filled with what is written (assistFillHint): the number of places filled, whether a number of the hint is
// left as it was, whether its condition is filled, the kinds of the names put in, and the texts that may fill its place.
export type AssistFilled = AssistHint & {
  filled: number; defaultNumericSlots?: boolean; conditionFilled?: boolean; boundKinds?: AssistNameKind[]; valueChoices?: string[];
};
// A near sentence as the candidates are ranked (assistCompare): its text and block, where it comes from (S2 a rewrite,
// S3 the search, S4 a signal), its layer, rank and place found, the places filled, and what the search found of it.
export interface AssistRanked {
  text: string; schemaId: string; origin: string; layer: number; rank: number; order: number; filled: number;
  fragment?: boolean; named?: boolean; special?: number; wordCount?: number; exact?: boolean; matchLength?: number; inText?: boolean;
}
// A sentence the search found (assistSearch): the hint filled, as it is ranked, with the intent it was found by and the
// blocks the place allows.
export type AssistRow = AssistFilled & AssistRanked & { intent?: SearchIntent | null; allowedSchemas?: Set<string> };
// A source a rewrite gives (assistStructuredTransforms, assistSignalTransforms, assistCompose): its text, its block, the
// words shown with it, and where it goes (a whole source replaced).
export interface AssistSource { text: string; schemaId?: string; description?: string; start?: number; end?: number; whole?: boolean }
// What is known of a rewrite found (assistCandidates): its block, its words, its place, the label of a check's
// proposal, whether it came from the check of the rewritten source, and whether it is a sentence for each part listed.
export interface AssistExtra { schemaId?: string; description?: string; start?: number; end?: number; label?: string; fromDiagnosis?: boolean; listed?: boolean }
// A near sentence looked at (assistCandidates): as it is ranked, with where it goes and what it was read as.
export type AssistPoolEntry = AssistRanked & Omit<AssistExtra, 'start' | 'end'> & Partial<Omit<AssistRow, keyof AssistRanked>> & {
  start: number; end: number; ast?: Script | null;
};
// A near sentence shown (assistCandidates): its block, where it comes from, its label and text (and the near sentence
// alone when the next sentence is shown with it), what is written and where, and the words shown with it.
export interface AssistCandidate {
  assist: true; schemaId: string; origin: string; label: string; text: string; sentence?: string; source: string;
  start: number; end: number; description?: string;
}
