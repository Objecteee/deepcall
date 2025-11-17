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
  
  // 渐变背景
  const bgGradient = isSpeaking 
    ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    : isListening 
    ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
    : 'linear-gradient(135deg, #64748b 0%, #475569 100%)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className={className} style={{ borderRadius: 9999 }}>
        <Avatar
          size={128}
          icon={<CustomerServiceOutlined style={{ fontSize: 48 }} />}
          style={{
            background: bgGradient,
            boxShadow: isSpeaking 
              ? '0 12px 32px rgba(102, 126, 234, 0.4)'
              : '0 12px 32px rgba(15, 23, 42, 0.15)',
            border: '4px solid #ffffff',
          }}
        />
      </div>
    </div>
  );
}


