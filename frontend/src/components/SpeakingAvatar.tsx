import { Avatar } from 'antd';
import { CustomerServiceOutlined } from '@ant-design/icons';
import { CallStatus } from '@store/callStore';

type Props = {
  status: CallStatus;
};

export default function SpeakingAvatar({ status }: Props) {
  const isSpeaking = status === 'speaking';
  const isListening = status === 'listening';
  const className = isSpeaking || isListening ? 'pulse-ring' : '';
  const bg = isSpeaking ? '#3b82f6' : isListening ? '#22c55e' : '#64748b';

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className={className} style={{ borderRadius: 9999 }}>
        <Avatar
          size={112}
          icon={<CustomerServiceOutlined />}
          style={{
            background: bg,
            boxShadow: '0 8px 24px rgba(15,23,42,.15)',
          }}
        />
      </div>
    </div>
  );
}


