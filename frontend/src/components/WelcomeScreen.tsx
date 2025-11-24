import React from 'react';
import { Typography, Space, Flex, Card } from 'antd';
import { motion } from 'framer-motion';
import CallButton from '@components/CallButton';

const { Title, Text } = Typography;

interface WelcomeScreenProps {
  onStartCall: () => void;
}

export default function WelcomeScreen({ onStartCall }: WelcomeScreenProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '80px 24px',
      }}
    >
      <Space direction="vertical" align="center" size={32} style={{ width: '100%' }}>
        {/* Hero Section */}
        <Space direction="vertical" align="center" size={20}>
          <Title level={1} style={{ 
            margin: 0, 
            fontSize: 56, 
            fontWeight: 700,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '-0.02em'
          }}>
            DeepCall AI
          </Title>
          <Text style={{ 
            fontSize: 20, 
            color: '#64748b',
            textAlign: 'center',
            maxWidth: 560,
            lineHeight: 1.6
          }}>
            实时语音聊天 · 屏幕讲解 · 摄像头视频助理
          </Text>
          <Text style={{ 
            fontSize: 15, 
            color: '#94a3b8',
            textAlign: 'center',
            maxWidth: 520
          }}>
            支持智能打断 · 流式字幕 · 屏幕共享 · 让 AI 看见你的屏幕和摄像头画面
          </Text>
        </Space>

        {/* Call Button */}
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }} 
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          style={{ marginTop: 32 }}
        >
          <CallButton onStart={onStartCall} label="开始对话" />
        </motion.div>

        {/* Feature Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          style={{ marginTop: 64, width: '100%', maxWidth: 840 }}
        >
          <Flex gap={20} wrap="wrap" justify="center">
            <FeatureCard 
              icon="🎙️" 
              title="实时语音对话" 
              desc="自然流畅的语音交互体验，支持多轮追问与上下文记忆" 
            />
            <FeatureCard 
              icon="⚡" 
              title="智能打断" 
              desc="说“打住”等口令或直接开口，即可实时打断 AI 的语音输出" 
            />
            <FeatureCard 
              icon="💬" 
              title="实时字幕 & 聊天记录" 
              desc="对话内容同步滚动显示，类微信气泡样式，方便回看与复制" 
            />
            <FeatureCard 
              icon="📺" 
              title="屏幕共享与摄像头" 
              desc="一键共享屏幕或打开摄像头，让 AI 看见你正在做什么并进行讲解" 
            />
          </Flex>
        </motion.div>
      </Space>
    </motion.div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <motion.div whileHover={{ y: -4 }} style={{ flex: '1 1 240px', minWidth: 240 }}>
      <Card 
        style={{ 
          height: '100%',
          borderRadius: 16,
          border: '1px solid rgba(0, 0, 0, 0.06)',
          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)',
          transition: 'all 0.3s ease',
          background: '#fff'
        }}
        styles={{ body: { padding: 24 } }}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div style={{ 
            fontSize: 32, 
            marginBottom: 4,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            {icon}
          </div>
          <Text strong style={{ fontSize: 16, display: 'block' }}>{title}</Text>
          <Text type="secondary" style={{ fontSize: 14, lineHeight: 1.6 }}>
            {desc}
          </Text>
        </Space>
      </Card>
    </motion.div>
  );
}

