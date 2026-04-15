export interface SlackMessage {
  text: string;
  ts: string; // Slack timestamp (unique message ID)
  channel: {
    id: string;
    name: string;
    is_im?: boolean;
    is_mpim?: boolean;
  };
  user: string; // user ID of message author
  username?: string; // display name if available
  permalink?: string;
}
