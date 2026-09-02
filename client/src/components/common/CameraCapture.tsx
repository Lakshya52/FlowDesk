import React, { useRef, useState, useCallback } from "react";
import { Camera, RefreshCw, X } from "lucide-react";

interface CameraCaptureProps {
  onCapture: (blob: Blob) => void;
  onClose: () => void;
}

const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");

  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      // camera not available
    }
  }, [facingMode]);

  React.useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [startCamera]);

  const capture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) {
        setPreview(canvas.toDataURL("image/jpeg"));
        onCapture(blob);
      }
    }, "image/jpeg", 0.85);
  };

  const retake = () => {
    setPreview(null);
    startCamera();
  };

  return (
    <div className="fixed inset-0 z-[3000] bg-black flex flex-col items-center justify-center">
      {!preview ? (
        <>
          <video ref={videoRef} autoPlay playsInline className="max-w-full max-h-[70vh] rounded-lg" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="flex gap-4 mt-4">
            <button
              onClick={capture}
              className="bg-white text-black p-4 h-15 w-15 flex items-center justify-center cursor-pointer rounded-full shadow-lg hover:bg-gray-200"
            >
              <Camera size={32} />
            </button>
            <button
              onClick={() => setFacingMode((m) => (m === "user" ? "environment" : "user"))}
              className="bg-gray-700 text-white p-3 h-15 w-15 flex items-center justify-center cursor-pointer rounded-full"
            >
              <RefreshCw size={24} />
            </button>
            <button onClick={onClose} className="bg-gray-700 text-white p-3 h-15 w-15 flex items-center justify-center cursor-pointer rounded-full"
 >
              <X size={24} />
            </button>
          </div>
        </>
      ) : (
        <>
          <img src={preview} alt="Captured" className="max-w-full max-h-[70vh] rounded-lg" />
          <div className="flex gap-4 mt-4">
            <button onClick={retake} className="bg-gray-700 text-white px-6 py-2 rounded-lg">
              Retake
            </button>
            <button onClick={onClose} className="bg-green-600 text-white px-6 py-2 rounded-lg">
              Use This
            </button>
          </div>
        </>
      )}
      {/* <button onClick={onClose} className="mt-4 text-white/60 text-sm hover:text-white">
        Cancel
      </button> */}
    </div>
  );
};

export default CameraCapture;
