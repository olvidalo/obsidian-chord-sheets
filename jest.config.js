/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
	testEnvironment: "node",
	transform: {
		"^.+.[tj]sx?$": ["ts-jest"],
	},
	transformIgnorePatterns: [
		'node_modules/(?!(escape-string-regexp)/)'
	],
	testMatch: ['**/test/**/*.test.ts']
};
