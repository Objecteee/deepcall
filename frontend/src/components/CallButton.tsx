import { Button } from 'antd';
import { motion } from 'framer-motion';
import { ReactNode } from 'react';
import { PhoneFilled } from '@ant-design/icons';

type Props = {
  onStart: () => void;
  label?: string;
  icon?: ReactNode;
};

export default function CallButton({ onStart, label = '开始通话', icon }: Props) {
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      style={{ display: 'inline-block' }}
    >
      <Button
        type="primary"
        size="large"
        icon={icon ?? <PhoneFilled />}
        onClick={onStart}
        style={{ 
          height: 56,
          paddingLeft: 32,
          paddingRight: 32,
          fontSize: 16,
          fontWeight: 600,
          borderRadius: 28,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          border: 'none',
          boxShadow: '0 4px 16px rgba(102, 126, 234, 0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}
      >
        {label}
      </Button>
    </motion.div>
  );
}


