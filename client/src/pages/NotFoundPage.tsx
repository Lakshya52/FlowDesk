import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, AlertCircle, ArrowLeft } from 'lucide-react';

const NotFoundPage: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="h-dvh flex items-center justify-center bg-(--color-bg) p-[24px] text-center">
            <div className="card animate-fade-in max-w-[480px] w-full px-[32px] py-[48px] flex flex-col items-center" style={{
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}>
                <div className="w-[80px] h-[80px] rounded-[50%] bg-(--color-danger-light) items-center justify-center mb-[24px]">
                    <AlertCircle size={40} color="var(--color-danger)" />
                </div>

                <h1 className="text-[4.5rem] font-black m-0" style={{
                    lineHeight: 1,
                    background: 'linear-gradient(135deg, var(--color-primary), #a78bfa)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    letterSpacing: '-0.05em'
                }}>
                    404
                </h1>

                <h2 className="text-(--color-text) mb-[12px] mt-[8px] font-bold text-[1.5rem]">
                    Something went wrong
                </h2>

                <p className="text-(--color-text-secondary) text-[1rem] mb-[32px] leading-[1.6]">
                    The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
                </p>

                <div className="flex gap-3" >
                    <button className="btn btn-secondary py-[12px] px-[24px]" onClick={() => navigate(-1)} >
                        <ArrowLeft size={18} />
                        Go Back
                    </button>
                    <button className="btn btn-primary py-[12px] px-[24px]" onClick={() => navigate('/')}>
                        <Home size={18} />
                        Home Page
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NotFoundPage;
