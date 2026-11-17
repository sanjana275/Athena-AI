import ChatView from "@/components/ChatView";
export default function ChatPage({ params }: { params: { id: string } }) {
  return <ChatView key={params.id} chatId={params.id} />;
}
