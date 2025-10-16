/**
 * Help tool that directs users to open the Get DNS Query Log command.
 * This tool exists to make the extension show up as an AI extension (@mention).
 */

type Input = {
  /** Optional: describe the issue (e.g., "peacock tv isn't working") */
  issue?: string;
};

export default async function help(input: Input): Promise<string> {
  return `Opening DNS Query Log...

Press Cmd+K and search "Get DNS Query Log" to see:
• Blocked domains grouped by root domain
• Navigate the list with arrow keys
• Press Enter on any domain to unblock it
• Use time dropdown to adjust search window (10/30/60/180 min)`;
}
