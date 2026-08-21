import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { getFirstAllowedRoute } from "../components/layout/Sidebar";
import { Eye, EyeOff, ArrowLeft, CheckCircle, Sun, Moon } from "lucide-react";
import { useThemeStore } from "../store/themeStore";




type ViewState =
	| "login"
	| "forgot-email"
	| "forgot-otp"
	| "forgot-success"
	| "change-password";

const LoginPage: React.FC = () => {
	const [view, setView] = useState<ViewState>("login");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [otp, setOtp] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [error, setError] = useState("");
	const [successMsg, setSuccessMsg] = useState("");
	const [showPw, setShowPw] = useState(false);

	// Default to the correct hooks assuming they exist via authStore
	const {
		login,
		forgotPassword,
		verifyForgotPasswordOtp,
		changePassword,
		isLoading,
	} = useAuthStore();
	const navigate = useNavigate();

	const handleLoginSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");
		try {
			const loggedInUser = await login(email, password);
			navigate(getFirstAllowedRoute(loggedInUser));
		} catch (err: any) {
			setError(err.message);
		}
	};
	// ------------------------------------------------------------------------

	const getErrorMessage = (err: any) => {
		if (!err) return "An unexpected error occurred";
		if (typeof err === "string") return err;
		return (
			err.response?.data?.message ||
			err.message ||
			"An unexpected error occurred"
		);
	};

	const handleForgotEmailSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");
		setSuccessMsg("");

		const trimmedEmail = email.trim();
		if (!trimmedEmail) {
			setError("Please enter your email address.");
			return;
		}

		try {
			await forgotPassword(trimmedEmail);
			setView("forgot-otp");
			setSuccessMsg(
				"If an account exists, an OTP has been sent to your email.",
			);
		} catch (err: any) {
			setError(getErrorMessage(err));
		}
	};

	const handleForgotOtpSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");
		setSuccessMsg("");
		try {
			await verifyForgotPasswordOtp(email, otp);
			setView("forgot-success");
		} catch (err: any) {
			setError(err.message);
		}
	};

	const handleChangePasswordSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");
		try {
			await changePassword(newPassword);
			navigate(getFirstAllowedRoute(useAuthStore.getState().user));
		} catch (err: any) {
			setError(err.message);
		}
	};
	
	const { isDark, toggle } = useThemeStore();

	return (
	
		
		
		<div className=" relative min-h-screen flex flex-col items-center justify-between bg-(--color-bg) "
			style={{ padding: window.innerWidth < 768 ? 16 : 24, }}
		>
			<div className="flex itens-center justify-between w-full">

			{/* Back Button */}
			<button
				onClick={() => {
					if (
						view !== "login" &&
						view !== "forgot-success" &&
						view !== "change-password"
					) {
						setView("login");
						setError("");
						setSuccessMsg("");
					} else {
						navigate("/");
					}
				}}
				className="btn btn-ghost  top-6 left-6 flex items-center gap-2 text-(--color-text-secondary) font-medium"
			>
				<ArrowLeft size={18} />{" "}
				{view === "login" ? "Back" : "Back to Login"}
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

			<div
				className="animate-fade-in h-[90dvh] flex flex-col items-center justify-center w-full"
				style={{ maxWidth: 400 }}
			>
				{/* Brand */}
				<div style={{ textAlign: "center", marginBottom: 40 }}>
					<div
						style={{
							width: 48,
							height: 48,
							borderRadius: 14,
							// background: 'linear-gradient(135deg, var(--color-primary), #a78bfa)',
							display: "inline-flex",
							alignItems: "center",
							justifyContent: "center",
							marginBottom: 16,
						}}
						className="overflow-hidden"
					>
						<img
							src="/icon.ico"
							alt="FlowDesk logo"
							className="rounded-xl scale-125"
						/>
						{/* <Zap size={24} color="white" /> */}
					</div>
					<h1
						style={{
							fontSize: "1.5rem",
							fontWeight: 700,
							letterSpacing: "-0.02em",
						}}
					>
						FlowDesk
					</h1>
					<p
						style={{
							color: "var(--color-text-secondary)",
							fontSize: "0.875rem",
							marginTop: 4,
						}}
					>
						{view === "login" && "Sign in to your workspace"}
						{view === "forgot-email" && "Reset your password"}
						{view === "forgot-otp" && "Verify your email"}
						{view === "forgot-success" && "Account Recovered"}
						{view === "change-password" && "Create new password"}
					</p>
				</div>

				{/* Form Card */}
				<div className="card w-full" style={{ padding: 32 }}>
					{error && (
						<div
							style={{
								padding: "10px 14px",
								borderRadius: 8,
								background: "var(--color-danger-light)",
								color: "var(--color-danger)",
								fontSize: "0.8125rem",
								fontWeight: 500,
								marginBottom: 20,
							}}
						>
							{error}
						</div>
					)}
					{successMsg && (
						<div
							style={{
								padding: "10px 14px",
								borderRadius: 8,
								background: "var(--color-success-light)",
								color: "var(--color-success)",
								fontSize: "0.8125rem",
								fontWeight: 500,
								marginBottom: 20,
							}}
						>
							{successMsg}
						</div>
					)}

					{/* LOGIN VIEW */}
					{view === "login" && (
						<form
							onSubmit={handleLoginSubmit}
							style={{
								display: "flex",
								flexDirection: "column",
								gap: 20,
							}}
						>
							<div>
								<label
									style={{
										display: "block",
										fontSize: "0.8125rem",
										fontWeight: 500,
										marginBottom: 6,
										color: "var(--color-text-secondary)",
									}}
								>
									Email address
								</label>
								<input
									type="email"
									className="input"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									placeholder="name@company.com"
									required
									autoFocus
								/>
							</div>

							<div>
								<div
									style={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "center",
										marginBottom: 6,
									}}
								>
									<label
										style={{
											fontSize: "0.8125rem",
											fontWeight: 500,
											color: "var(--color-text-secondary)",
										}}
									>
										Password
									</label>
									<button
										type="button"
										style={{
											fontSize: "0.75rem",
											color: "var(--color-primary)",
											background: "none",
											border: "none",
											cursor: "pointer",
											fontWeight: 500,
										}}
										onClick={() => {
											setView("forgot-email");
											setError("");
										}}
									>
										Forgot Password?
									</button>
								</div>
								<div style={{ position: "relative" }}>
									<input
										type={showPw ? "text" : "password"}
										className="input"
										value={password}
										onChange={(e) =>
											setPassword(e.target.value)
										}
										placeholder="Enter your password"
										required
										style={{ paddingRight: 40 }}
									/>
									<button
										type="button"
										onClick={() => setShowPw(!showPw)}
										style={{
											position: "absolute",
											right: 8,
											top: "50%",
											transform: "translateY(-50%)",
											background: "none",
											border: "none",
											cursor: "pointer",
											padding: 4,
											color: "var(--color-text-tertiary)",
										}}
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
								className="btn btn-primary"
								disabled={isLoading}
								style={{
									width: "100%",
									padding: "10px 16px",
									fontSize: "0.875rem",
									marginTop: 4,
								}}
							>
								{isLoading ? "Signing in..." : "Sign in"}
							</button>
						</form>
					)}

					{/* FORGOT PASSWORD - EMAIL VIEW */}
					{view === "forgot-email" && (
						<form
							onSubmit={handleForgotEmailSubmit}
							style={{
								display: "flex",
								flexDirection: "column",
								gap: 20,
							}}
						>
							<p
								style={{
									fontSize: "0.875rem",
									color: "var(--color-text-secondary)",
									lineHeight: 1.5,
									margin: 0,
								}}
							>
								Enter the email address associated with your
								account and we'll send you a 6-digit
								verification code.
							</p>
							<div>
								<label
									style={{
										display: "block",
										fontSize: "0.8125rem",
										fontWeight: 500,
										marginBottom: 6,
										color: "var(--color-text-secondary)",
									}}
								>
									Email address
								</label>
								<input
									type="email"
									className="input"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									placeholder="name@company.com"
									required
									autoFocus
								/>
							</div>

							<button
								type="submit"
								className="btn btn-primary"
								disabled={isLoading || !email}
								style={{
									width: "100%",
									padding: "10px 16px",
									fontSize: "0.875rem",
									marginTop: 4,
								}}
							>
								{isLoading
									? "Sending..."
									: "Send Verification Code"}
							</button>
						</form>
					)}

					{/* FORGOT PASSWORD - OTP VIEW */}
					{view === "forgot-otp" && (
						<form
							onSubmit={handleForgotOtpSubmit}
							style={{
								display: "flex",
								flexDirection: "column",
								gap: 20,
							}}
						>
							<p
								style={{
									fontSize: "0.875rem",
									color: "var(--color-text-secondary)",
									lineHeight: 1.5,
									margin: 0,
								}}
							>
								We've sent a 6-digit code to{" "}
								<strong>{email}</strong>. Please enter it below.
							</p>
							<div>
								<label
									style={{
										display: "block",
										fontSize: "0.8125rem",
										fontWeight: 500,
										marginBottom: 6,
										color: "var(--color-text-secondary)",
									}}
								>
									6-Digit Code
								</label>
								<input
									type="text"
									className="input"
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
										textAlign: "center",
										fontSize: "1.25rem",
										fontWeight: 600,
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
								{isLoading ? "Verifying..." : "Verify Code"}
							</button>
						</form>
					)}

					{/* FORGOT PASSWORD - SUCCESS VIEW */}
					{view === "forgot-success" && (
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								gap: 20,
								alignItems: "center",
							}}
						>
							<div style={{ color: "var(--color-success)" }}>
								<CheckCircle size={48} />
							</div>
							<h2
								style={{
									fontSize: "1.25rem",
									fontWeight: 600,
									margin: 0,
								}}
							>
								Verification Successful!
							</h2>
							<p
								style={{
									fontSize: "0.875rem",
									color: "var(--color-text-secondary)",
									textAlign: "center",
									marginBottom: 10,
								}}
							>
								You are safely authenticated. Would you like to
								set a new password or continue directly to your
								dashboard?
							</p>

							<div
								style={{
									display: "flex",
									flexDirection: "column",
									gap: 12,
									width: "100%",
								}}
							>
								<button
									onClick={() => navigate(getFirstAllowedRoute(useAuthStore.getState().user))}
									className="btn btn-primary"
									style={{
										width: "100%",
										padding: "10px 16px",
										fontSize: "0.875rem",
									}}
								>
									Continue to Dashboard
								</button>
								<button
									onClick={() => setView("change-password")}
									className="btn btn-outline"
									style={{
										width: "100%",
										padding: "10px 16px",
										fontSize: "0.875rem",
										background: "transparent",
										border: "1px solid var(--color-border)",
										color: "var(--color-text-primary)",
									}}
								>
									Change Password Now
								</button>
							</div>
						</div>
					)}

					{/* CHANGE PASSWORD VIEW */}
					{view === "change-password" && (
						<form
							onSubmit={handleChangePasswordSubmit}
							style={{
								display: "flex",
								flexDirection: "column",
								gap: 20,
							}}
						>
							<p
								style={{
									fontSize: "0.875rem",
									color: "var(--color-text-secondary)",
									lineHeight: 1.5,
									margin: 0,
								}}
							>
								Please create a new password for your account.
							</p>
							<div>
								<label
									style={{
										display: "block",
										fontSize: "0.8125rem",
										fontWeight: 500,
										marginBottom: 6,
										color: "var(--color-text-secondary)",
									}}
								>
									New Password
								</label>
								<div style={{ position: "relative" }}>
									<input
										type={showPw ? "text" : "password"}
										className="input"
										value={newPassword}
										onChange={(e) =>
											setNewPassword(e.target.value)
										}
										placeholder="Enter new password"
										required
										minLength={6}
										autoFocus
										style={{ paddingRight: 40 }}
									/>
									<button
										type="button"
										onClick={() => setShowPw(!showPw)}
										style={{
											position: "absolute",
											right: 8,
											top: "50%",
											transform: "translateY(-50%)",
											background: "none",
											border: "none",
											cursor: "pointer",
											padding: 4,
											color: "var(--color-text-tertiary)",
										}}
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
								className="btn btn-primary"
								disabled={isLoading || newPassword.length < 6}
								style={{
									width: "100%",
									padding: "10px 16px",
									fontSize: "0.875rem",
									marginTop: 4,
								}}
							>
								{isLoading
									? "Updating..."
									: "Update Password & Login"}
							</button>
						</form>
					)}
				</div>
				<div
					style={{
						textAlign: "center",
						marginTop: 20,
						fontSize: "0.8125rem",
						color: "var(--color-text-secondary)",
					}}
				>
					New to FlowDesk?{" "}
					<Link
						to="/register"
						style={{
							color: "var(--color-primary)",
							fontWeight: 500,
							textDecoration: "none",
						}}
					>
						Register here
					</Link>
				</div>
			</div>
		</div>
		
	);
};

export default LoginPage;
