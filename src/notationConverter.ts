import { Note } from "tonal";

/**
 * Converts a chord symbol from German/Russian notation to Western notation for parsing.
 * 
 * Mapping rules:
 * - 'H' (Si natural) -> 'B'
 * - 'B' (Si flat)     -> 'Bb'
 * - Other notes remain unchanged.
 * 
 * Handles slash chords (e.g., "Hm/G" -> "Bm/B") by processing tonic and bass separately.
 * Preserves suffixes and extensions exactly as they are, relying on Tonal's aliases.
 * 
 * @param symbol - The chord symbol in local notation (e.g., "Hm7", "B/D").
 * @param useGermanNotation - Whether to apply the conversion.
 * @returns The chord symbol in Western notation suitable for Tonal parsing.
 */
export function toWestern(symbol: string, useGermanNotation: boolean): string {
    if (!useGermanNotation) {
        return symbol;
    }

    // Split by slash to handle bass notes independently
    const parts = symbol.split("/");
    const convertedParts = parts.map(part => convertNotePart(part));
    
    return convertedParts.join("/");
}

/**
 * Converts a chord symbol from Western notation back to German/Russian notation for display.
 * 
 * Mapping rules:
 * - 'B' (Si natural)     -> 'H'
 * - 'Bb' (Si flat)       -> 'B'
 * - 'B#' (rare)          -> 'Cb' (enharmonic handling might be needed, but sticking to simple map first)
 * 
 * This function attempts to detect the specific accidental to avoid false positives 
 * (e.g., distinguishing between a standalone 'B' and 'Bb').
 * 
 * @param symbol - The chord symbol in Western notation.
 * @param useGermanNotation - Whether to apply the conversion.
 * @returns The chord symbol in local notation for display.
 */
export function toLocal(symbol: string, useGermanNotation: boolean): string {
    if (!useGermanNotation) {
        return symbol;
    }

    // Split by slash to handle bass notes independently
    const parts = symbol.split("/");
    const convertedParts = parts.map(part => revertNotePart(part));
    
    return convertedParts.join("/");
}

/**
 * Helper to convert the note root of a chord part (e.g., "Hm7" -> "Bm7").
 * It identifies the root note at the beginning of the string.
 */
function convertNotePart(part: string): string {
    if (!part) return part;

    // Regex to capture the root note (letter + optional accidental)
    // Matches: B, Bb, B#, H, C, C#, Db, etc.
    const match = part.match(/^([A-H])([#b]?)(.*)$/);
    if (!match) return part;

    const [, note, accidental, suffix] = match;

    let newNote = note;
    let newAccidental = accidental;

    if (note === "H") {
        // H (Si natural) -> B
        newNote = "B";
        newAccidental = ""; // H is always natural in this context
    } else if (note === "B") {
        if (accidental === "") {
            // Standalone B in German/Russian context is Si flat -> Bb
            newNote = "B";
            newAccidental = "b";
        } else if (accidental === "b") {
            // Bb is already Western, but in German input "B" is Bb. 
            // If user types "Bb", it's technically redundant in strict German but we handle it gracefully.
            // Actually, in strict German: B = Bb, H = B. There is no "Bb" usually, just "B".
            // But if present, Bb -> Bb (no change needed for tonal).
            // However, our logic above: if input is "B", we make it "Bb".
            // If input is "Bb", we leave it "Bb".
        } else if (accidental === "#") {
            // B# -> B# (rare)
        }
    }
    
    // Handle edge case: If input was "B" (meaning Bb), we output "Bb".
    // If input was "H" (meaning B), we output "B".
    
    // Re-evaluating strict mapping based on prompt:
    // Input "H" -> Output "B"
    // Input "B" -> Output "Bb"
    
    if (note === "H") {
        return `B${suffix}`;
    }
    if (note === "B" && accidental === "") {
        return `Bb${suffix}`;
    }

    return part;
}

/**
 * Helper to revert the note root from Western to local notation.
 */
function revertNotePart(part: string): string {
    if (!part) return part;

    // We need to be careful distinguishing B (Si) from Bb (Si flat).
    // Tonal returns "B" for Si major, "Bb" for Si flat major.
    
    const match = part.match(/^([A-G])([#b]?)(.*)$/);
    if (!match) return part;

    const [, note, accidental, suffix] = match;

    if (note === "B") {
        if (accidental === "") {
            // Western "B" (Si natural) -> Local "H"
            return `H${suffix}`;
        } else if (accidental === "b") {
            // Western "Bb" (Si flat) -> Local "B"
            return `B${suffix}`;
        }
    }

    return part;
}

/**
 * Normalizes a single note string (e.g. for bass notes or standalone notes).
 */
export function normalizeNoteToWestern(note: string, useGermanNotation: boolean): string {
    if (!useGermanNotation) return note;
    return convertNotePart(note);
}

/**
 * Denormalizes a single note string back to local notation.
 */
export function normalizeNoteToLocal(note: string, useGermanNotation: boolean): string {
    if (!useGermanNotation) return note;
    return revertNotePart(note);
}
