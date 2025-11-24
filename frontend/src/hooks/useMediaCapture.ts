import { useState, useRef, useEffect, useCallback } from 'react';
import { App as AntdApp } from 'antd';
import { RealtimeWsClient } from '@rtc/RealtimeWsClient';
import { eid } from '@utils/eid'; // We need to extract this utility too

// Create a small utility file for eid or define it here temporarily
// For now, I'll assume I'll put it in utils
const generateEid = () => 'event_' + Math.random().toString(36).slice(2) + Date.now().toString(36);

export function useMediaCapture(wsRef: React.MutableRefObject<RealtimeWsClient | null>) {
  const { message } = AntdApp.useApp();
  
  // 屏幕共享状态
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenCaptureTimerRef = useRef<number | null>(null);

  // 摄像头状态
  const [isCameraOn, setIsCameraOn] = useState(false);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraCaptureTimerRef = useRef<number | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  // 本地预览同步
  useEffect(() => {
    const videoEl = localVideoRef.current;
    if (!videoEl) return;

    if (isCameraOn && cameraStreamRef.current) {
      (videoEl as HTMLVideoElement & { playsInline?: boolean }).srcObject = cameraStreamRef.current;
      videoEl.muted = true;
      (videoEl as HTMLVideoElement & { playsInline?: boolean }).playsInline = true;
      void videoEl.play().catch(() => {});
    } else {
      (videoEl as HTMLVideoElement & { playsInline?: boolean }).srcObject = null;
    }
  }, [isCameraOn]);

  // 停止屏幕共享
  const stopScreenShare = useCallback(() => {
    if (screenCaptureTimerRef.current != null) {
      window.clearInterval(screenCaptureTimerRef.current);
      screenCaptureTimerRef.current = null;
    }

    const stream = screenStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch { /* ignore */ }
      });
    }
    screenStreamRef.current = null;
    setIsScreenSharing(false);
  }, []);

  // 停止摄像头
  const stopCamera = useCallback(() => {
    if (cameraCaptureTimerRef.current != null) {
      window.clearInterval(cameraCaptureTimerRef.current);
      cameraCaptureTimerRef.current = null;
    }

    const stream = cameraStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch { /* ignore */ }
      });
    }
    cameraStreamRef.current = null;
    setIsCameraOn(false);
  }, []);

  // 切换屏幕共享
  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      stopScreenShare();
      message.success('已停止屏幕共享');
      return;
    }

    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        message.error('当前浏览器不支持屏幕共享');
        return;
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 2, max: 5 } },
        audio: false,
      });

      if (!stream) {
        message.error('未获取到屏幕共享流');
        return;
      }

      screenStreamRef.current = stream;
      setIsScreenSharing(true);

      // Setup frame capture
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      (video as HTMLVideoElement & { playsInline?: boolean }).playsInline = true;
      void video.play().catch(() => {});

      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();
      const targetWidth = 1280;
      const targetHeight = settings.height && settings.width 
        ? Math.round((settings.height / settings.width) * targetWidth) 
        : 720;

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      const captureAndSendFrame = () => {
        if (!screenStreamRef.current || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
        try {
          ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            if (!blob) return;
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = (reader.result as string).split(',')[1];
              if (base64) {
                wsRef.current?.sendJson({
                  type: 'input_image_buffer.append',
                  event_id: generateEid(),
                  image: base64,
                });
              }
            };
            reader.readAsDataURL(blob);
          }, 'image/jpeg', 0.7);
        } catch (err) {
          console.error('Capture screen frame failed', err);
        }
      };

      const timerId = window.setInterval(captureAndSendFrame, 1000);
      screenCaptureTimerRef.current = timerId;

      stream.getVideoTracks().forEach((t) => {
        t.onended = () => {
          stopScreenShare();
          message.info('屏幕共享已结束');
        };
      });

      message.success('已开始屏幕共享');
    } catch (err: any) {
      console.error(err);
      message.error(`屏幕共享失败：${err.message}`);
    }
  };

  // 切换摄像头
  const toggleCamera = async () => {
    if (isCameraOn) {
      stopCamera();
      message.success('已关闭摄像头');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15 } },
        audio: false,
      });

      cameraStreamRef.current = stream;
      setIsCameraOn(true);

      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      (video as HTMLVideoElement & { playsInline?: boolean }).playsInline = true;
      void video.play().catch(() => {});

      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');

      const captureAndSendFrame = () => {
        if (!cameraStreamRef.current || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
        try {
          ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            if (!blob) return;
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = (reader.result as string).split(',')[1];
              if (base64) {
                wsRef.current?.sendJson({
                  type: 'input_image_buffer.append',
                  event_id: generateEid(),
                  image: base64,
                });
              }
            };
            reader.readAsDataURL(blob);
          }, 'image/jpeg', 0.7);
        } catch (err) {
          console.error('Capture camera frame failed', err);
        }
      };

      const timerId = window.setInterval(captureAndSendFrame, 1000);
      cameraCaptureTimerRef.current = timerId;

      stream.getVideoTracks().forEach((t) => {
        t.onended = () => {
          stopCamera();
          message.info('摄像头已关闭');
        };
      });

      message.success('已打开摄像头');
    } catch (err: any) {
      console.error(err);
      message.error(`摄像头打开失败：${err.message}`);
    }
  };

  return {
    isScreenSharing,
    isCameraOn,
    screenStreamRef,
    cameraStreamRef,
    localVideoRef,
    toggleScreenShare,
    toggleCamera,
    stopScreenShare,
    stopCamera
  };
}

