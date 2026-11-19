import ChatView from "@/components/ChatView";

export function generateStaticParams() {
  return [{ id: "session" }];
}

export const dynamicParams = true;

export default function ChatPage({ params }: { params: { id: string } }) {
  return <ChatView key={params.id} chatId={params.id} />;
}
