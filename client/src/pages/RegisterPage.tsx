import React, { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import {
	Eye,
	EyeOff,
	ArrowLeft,
	Building2,
	Globe,
	Phone,
	Briefcase,
	Mail,
	CheckCircle,
    Sun,
    Moon
} from "lucide-react";
import { useThemeStore } from "../store/themeStore";

type Step = "form" | "otp" | "success";

const RegisterPage: React.FC = () => {
const [step, setStep] = useState<Step>("form");
const [companyName, setCompanyName] = useState("");
const [website, setWebsite] = useState("");
const [phone, setPhone] = useState("");
const [industry, setIndustry] = useState("");
const [name, setName] = useState("");
const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const [otp, setOtp] = useState("");
const [error, setError] = useState("");
const [showPw, setShowPw] = useState(false);
const [resendCooldown, setResendCooldown] = useState(0);
const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const {
		register,
		verifyRegistrationOtp,
		resendRegistrationOtp,
		isLoading,
	} = useAuthStore();
	const navigate = useNavigate();
	const { isDark, toggle } = useThemeStore();

	useEffect(() => {
		return () => {
			if (timerRef.current) clearInterval(timerRef.current);
		};
	}, []);

	const startResendCooldown = () => {
		setResendCooldown(30);
		timerRef.current = setInterval(() => {
			setResendCooldown((prev) => {
				if (prev <= 1) {
					if (timerRef.current) clearInterval(timerRef.current);
					return 0;
				}
				return prev - 1;
			});
		}, 1000);
	};

	const handleResendOtp = async () => {
		try {
			await resendRegistrationOtp(email);
			startResendCooldown();
			setError("");
		} catch (err: any) {
			setError(err.message);
		}
	};

	const handleFormSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");

		let finalWebsite = website.trim();
		if (
			finalWebsite &&
			!/^https?:\/\//i.test(finalWebsite) &&
			!/^www\./i.test(finalWebsite)
		) {
			finalWebsite = `https://www.${finalWebsite}`;
		}

		try {
			await register({
				name,
				email,
				password,
				companyName,
				website: finalWebsite,
				phone,
				industry,
			});
			setStep("otp");
			startResendCooldown();
		} catch (err: any) {
			setError(err.message);
		}
	};

	const handleOtpSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");
		try {
			await verifyRegistrationOtp(email, otp);
			setStep("success");
		} catch (err: any) {
			setError(err.message);
		}
	};

	const handleBack = () => {
		if (step === "otp") {
			setStep("form");
			setError("");
			setOtp("");
		} else {
			navigate("/");
		}
	};

	if (step === "success") {
		return (
			<div className="min-h-vh flex items-center justify-center bg-(--color-bg) p-6">
				<div className="animate-fade-in w-full max-w-105 h-[90dvh] flex flex-col items-center justify-center text-center">
					<div className="text-(--color-success) mb-4">
						<CheckCircle size={56} style={{ margin: "0 auto" }} />
					</div>
					<h2
						className="font-bold mb-2"
						style={{ fontSize: "1.5rem" }}
					>
						Workspace Created!
					</h2>
					<p
						className="text-(--color-text-secondary)"
						style={{ fontSize: "0.875rem", marginBottom: 24 }}
					>
						Your company and admin account are ready.
					</p>
					<button
						onClick={() => navigate("/dashboard")}
						className="btn btn-primary w-full py-2.5 px-4"
						style={{ fontSize: "0.875rem" }}
					>
						Go to Dashboard
					</button>
				</div>
			</div>
		);
	}

	return (
		<div
			className="min-h-vh flex flex-col items-center justify-center bg-(--color-bg) relative"
			style={{
				padding: window.innerWidth < 768 ? 16 : 24,
			}}
		>
            <div className="flex itens-center justify-between w-full">
                {/* back button */}
                <button
                    onClick={handleBack}
                    className="btn btn-ghost top-6 left-6 gap-2 text-(--color-text-secondary) font-medium"
                >
                    <ArrowLeft size={18} />{" "}
                    {step === "otp" ? "Back to Form" : "Back"}
                </button>

                {/* theme changing button */}
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={toggle}
                    title="Toggle theme"
                >
                    {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            </div>

            {/* main */}
			<div className="h-[90dvh] flex items-center justify-center flex-col animate-fade-in w-dvw max-w-150">
				<div className="text-center mb-8">
					<div className="overflow-hidden inline-flex items-center justify-center mb-4 rounded-2xl w-12 h-12 ">
						<img
							src="/icon.ico"
							alt="FlowDesk logo"
							className="rounded-xl scale-125"
						/>
					</div>
					<h1
						className="text-2xl font-bold"
						style={{ letterSpacing: "-0.02em" }}
					>
						{step === "form"
							? "Flowdesk - Create your workspace"
							: "Verify Your Email"}
					</h1>
					<p
						className="text-(--color-text-secondary) mt-1"
						style={{ fontSize: "0.875rem" }}
					>
						{step === "form"
							? "Set up your company and admin account"
							: `We've sent a 6-digit code to ${email}`}
					</p>
				</div>

				<div className="card" style={{ padding: 32 }}>
					{error && (
						<div
							className="py-2.5 px-3.5 rounded-lg bg-(--color-danger-light) text-(--color-danger) font-medium mb-5"
							style={{ fontSize: "0.8125rem" }}
						>
							{error}
						</div>
					)}

					{step === "form" && (
						<form
							onSubmit={handleFormSubmit}
							className="flex flex-col gap-4"
						>
							<div
								className="grid gap-3"
								style={{ gridTemplateColumns: "1fr 1fr " }}
							>
                                <div>

                                    <label
                                        className="block font-medium mb-1.5 text-(--color-text-secondary)"
                                        style={{ fontSize: "0.8125rem" }}
                                    >
                                        Company Name{" "}
                                        <span className="text-(--color-danger)">
                                            *
                                        </span>
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            className="input"
                                            value={companyName}
                                            onChange={(e) =>
                                                setCompanyName(e.target.value)
                                            }
                                            placeholder="Your Company Inc."
                                            required
                                            autoFocus
                                            style={{ paddingLeft: 36 }}
                                        />
                                        <Building2
                                            size={16}
                                            className="absolute left-2.5 top-[50%] translate-y-[-50%] text-(--color-text-tertiary) pointer-events-none"
                                        />
                                    </div>
                                </div>
                                <div>
									<label
										className="block font-medium mb-1.5 text-(--color-text-secondary)"
										style={{ fontSize: "0.8125rem" }}
									>
										Website
									</label>
									<div className="relative">
										<input
											type="text"
											inputMode="url"
											className="input"
											value={website}
											onChange={(e) =>
												setWebsite(e.target.value)
											}
											placeholder="example.com"
											style={{ paddingLeft: 36 }}
										/>
										<Globe
											size={16}
											className="absolute left-2.5 top-[50%] translate-y-[-50%] text-(--color-text-tertiary) pointer-events-none"
										/>
									</div>
								</div>

							</div>

							<div
								className="grid gap-3"
								style={{ gridTemplateColumns: "1fr 1fr " }}
							>
								
								<div>
									<label
										className="block font-medium mb-1.5 text-(--color-text-secondary)"
										style={{ fontSize: "0.8125rem" }}
									>
										Phone
									</label>
									<div className="relative">
										<input
											type="tel"
											className="input"
											value={phone}
											onChange={(e) =>
												setPhone(e.target.value)
											}
											placeholder="+91 12345 67890"
											style={{ paddingLeft: 36 }}
										/>
										<Phone
											size={16}
											className="absolute left-2.5 top-[50%] translate-y-[-50%] text-(--color-text-tertiary) pointer-events-none"
										/>
									</div>
								</div>

                                <div>
                                    <label
                                        className="block font-medium mb-1.5 text-(--color-text-secondary)"
                                        style={{ fontSize: "0.8125rem" }}
                                    >
                                        Industry
                                    </label>
                                    <div
                                        className="relative"
                                        style={{ position: "relative" }}
                                    >
                                        <input
                                            type="text"
                                            className="input"
                                            value={industry}
                                            onChange={(e) =>
                                                setIndustry(e.target.value)
                                            }
                                            placeholder="e.g. Technology, Finance, Healthcare"
                                            style={{ paddingLeft: 36 }}
                                        />
                                        <Briefcase
                                            size={16}
                                            className="absolute left-2.5 top-[50%] translate-y-[-50%] text-(--color-text-tertiary) pointer-events-none"
                                        />
                                    </div>
                                </div>


							</div>

							

							<hr className="border-t border-(--color-border) my-1 mx-0" />

							<div>
								<label
									className="block font-medium mb-1.5 text-(--color-text-secondary)"
									style={{ fontSize: "0.8125rem" }}
								>
									Your Name{" "}
									<span className="text-(--color-danger)">
										*
									</span>
								</label>
								<input
									type="text"
									className="input"
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder="Lakshya Mittal"
									required
								/>
							</div>

							<div>
								<label
									className="block font-medium mb-1.5 text-(--color-tes-secondary)"
									style={{ fontSize: "0.8125rem" }}
								>
									Email address{" "}
									<span className="text-(--color-danger)">
										*
									</span>
								</label>
								<div style={{ position: "relative" }}>
									<input
										type="email"
										className="input"
										value={email}
										onChange={(e) =>
											setEmail(e.target.value)
										}
										placeholder="admin@company.com"
										required
										style={{ paddingLeft: 36 }}
									/>
									<Mail
										size={16}
										className="absolute left-2.5 top-[50%] translate-y-[-50%] text-(--color-text-tertiary) pointer-events-none"
									/>
								</div>
							</div>

							<div>
								<label
									className="block font-medium mb-1.5 text-(--color-text-secondary)"
									style={{ fontSize: "0.8125rem" }}
								>
									Password{" "}
									<span className="text-(--color-danger)">
										*
									</span>
								</label>
								<div className="relative">
									<input
										type={showPw ? "text" : "password"}
										className="input"
										value={password}
										onChange={(e) =>
											setPassword(e.target.value)
										}
										placeholder="Min. 6 characters"
										required
										minLength={6}
										style={{ paddingRight: 40 }}
									/>
									<button
										type="button"
										onClick={() => setShowPw(!showPw)}
										className="absolute right-2 top-[50%] translate-y-[-50%] bg-none border-none cursor-pointer p-1 text-(--color-text-tertiary)"
									>
										{showPw ? (
											<EyeOff size={16} />
										) : (
											<Eye size={16} />
										)}
									</button>
								</div>
							</div>

							<button
								type="submit"
								className="btn btn-primary w-full py-2.5 px-4 mt-1"
								disabled={isLoading}
								style={{
									fontSize: "0.875rem",
								}}
							>
								{isLoading
									? "Sending verification..."
									: "Send Verification Code"}
							</button>
						</form>
					)}

					{step === "otp" && (
						<form
							onSubmit={handleOtpSubmit}
							className="flex flex-col gap-5"
						>
							<p
								className="text-(--color-text-secondary) m-0"
								style={{
									fontSize: "0.875rem",
									lineHeight: 1.5,
								}}
							>
								Enter the 6-digit verification code sent to{" "}
								<strong>{email}</strong>.
							</p>
							<div>
								<label
									className="block font-medium mb-1.5 text-(--color-text-secondary)"
									style={{
										fontSize: "0.8125rem",
									}}
								>
									6-Digit Code
								</label>
								<input
									type="text"
									className="input text-center font-semibold"
									value={otp}
									onChange={(e) =>
										setOtp(
											e.target.value
												.replace(/\D/g, "")
												.slice(0, 6),
										)
									}
									placeholder="000000"
									required
									autoFocus
									style={{
										letterSpacing: "8px",
										fontSize: "1.25rem",
									}}
								/>
							</div>

							<button
								type="submit"
								className="btn btn-primary"
								disabled={isLoading || otp.length !== 6}
								style={{
									width: "100%",
									padding: "10px 16px",
									fontSize: "0.875rem",
									marginTop: 4,
								}}
							>
								{isLoading
									? "Verifying..."
									: "Verify & Create Workspace"}
							</button>

							<div style={{ textAlign: "center", marginTop: 8 }}>
								<button
									type="button"
									onClick={handleResendOtp}
									disabled={resendCooldown > 0}
									className="bg-none border-none font-medium p-0"
									style={{
										cursor:
											resendCooldown > 0
												? "not-allowed"
												: "pointer",
										fontSize: "0.8125rem",
										color:
											resendCooldown > 0
												? "var(--color-text-tertiary)"
												: "var(--color-primary)",
									}}
								>
									{resendCooldown > 0
										? `Resend code in ${resendCooldown}s`
										: "Resend verification code"}
								</button>
							</div>
						</form>
					)}
				</div>

				<div
					className="text-center mt-5 text-(--color-text-secondary)"
					style={{ fontSize: "0.8125rem" }}
				>
					Already have a workspace?{" "}
					<Link
						to="/login"
						className="text-(--color-primary) font-medium decoration-none"
					>
						Sign in
					</Link>
				</div>
			</div>
		</div>
	);
};

export default RegisterPage;