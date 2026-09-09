import {uniqueChordTokens} from "../src/chordsUtils";
import {tokenizeLine} from "../src/sheet-parsing/tokenizeLine";
import {isChordToken} from "../src/sheet-parsing/tokens";

describe("uniqueChordTokens", () => {
	const unique = (line: string) => uniqueChordTokens(tokenizeLine(line, 0, "%c", "%t").tokens.filter(isChordToken)).map(t => t.value);

	test("keeps the first occurrence of a symbol", () => {
		expect(unique("C G C Am G")).toEqual(["C", "G", "Am"]);
	});

	test("a symbol with its own definition is another chord", () => {
		expect(unique("C C[x32010] C C7[3 7 9] C7[1 5 | 3 b7 9] C7[3 7 9]")).toEqual(["C", "C[x32010]", "C7[3 7 9]", "C7[1 5 | 3 b7 9]"]);
	});

	test("inline chords count by symbol, whatever the brackets contain", () => {
		expect(unique("[Am]Some [Am aux]text [Am]")).toEqual(["[Am]"]);
	});
});
