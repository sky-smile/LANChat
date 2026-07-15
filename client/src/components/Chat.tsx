import { Card, Empty } from 'antd';
import './Chat.css';

function Chat() {
  return (
    <div className="chat-container">
      <Card className="chat-empty">
        <Empty description="选择一个聊天开始对话" />
      </Card>
    </div>
  );
}

export default Chat;
