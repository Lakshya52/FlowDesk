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
				"An OTP has been sent to your email. It is valid for 15 minutes.",
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
		<div
			className=" relative min-h-screen flex flex-col items-center justify-between bg-(--color-bg) "
			style={{ padding: window.innerWidth < 768 ? 16 : 24 }}
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
					className="btn btn-ghost top-6 left-6 flex items-center gap-2 text-(--color-text-secondary) font-medium"
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

            {/* main */}
			<div className="animate-fade-in h-[90dvh] flex flex-col items-center justify-center w-full max-w-100">
				{/* Brand */}
				<div className="flex flex-col items-center mb-10">
					<div className="w-12 h-12 rounded-2xl inline-flex items-center justify-center mb-4 overflow-hidden">
						<img
							src="/icon.ico"
							alt="FlowDesk logo"
							className="rounded-xl scale-125"
						/>
					</div>
					<h1 className="text-2xl font-bold ">FlowDesk - Sign In</h1>
					<p className="text-(--color-text-secondary) text-[0.875rem] mt-1">
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
							className="py-2.5 px-3.5 rounded-lg bg-(--color-danger-light) font-medium mb-5"
							style={{ fontSize: "0.8125rem" }}
						>
							{error}
						</div>
					)}
					{successMsg && (
						<div
							className="py-2.5 px-3.5 rounded-lg bg-(--color-success-light) text-(--color-success) font-medium mb-5"
							style={{ fontSize: "0.8125rem" }}
						>
							{successMsg}
						</div>
					)}

					{/* LOGIN VIEW */}
					{view === "login" && (
						<form
							onSubmit={handleLoginSubmit}
							className="flex flex-col gap-5"
						>
							<div>
								<label
									className="block font-medium mb-1.5 text-(--color-text-secondary)"
									style={{ fontSize: "0.8125rem" }}
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
								<div className="flex justify-between items-center mb-1.5 text-(--color-text-secondary) font-medium">
									<label style={{ fontSize: "0.8125rem" }} >
										Password
									</label>
									<button
										type="button"
										className="text-(--color-primary) border-none bg-none cursor-pointer font-medium"
										style={{ fontSize: "0.75rem" }}
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
										className="input pr-10"
										value={password}
										onChange={(e) =>
											setPassword(e.target.value)
										}
										placeholder="Enter your password"
										required
										// style={{ paddingRight: 40 }}
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
								style={{ fontSize: "0.875rem" }}
							>
								{isLoading ? "Signing in..." : "Sign in"}
							</button>
						</form>
					)}

					{/* FORGOT PASSWORD - EMAIL VIEW */}
					{view === "forgot-email" && (
						<form
							onSubmit={handleForgotEmailSubmit}
							className="flex flex-col gap-5"
						>
							<p
								className="text-(--color-text-secondary) m-0"
								style={{
									fontSize: "0.875rem",
									lineHeight: 1.5,
								}}
							>
								Enter the email address associated with your
								account and we'll send you a 6-digit
								verification code.
							</p>
							<div>
								<label
									className="block font-medium mb-1.5 text-(--color-text-secondary)"
									style={{
										fontSize: "0.8125rem",
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
								className="btn btn-primary w-full py-2.5 px-4 mt-1"
								disabled={isLoading || !email.includes("@")}
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
							className="flex flex-col gap-5"
						>
						<p
							className="text-(--color-text-secondary) m-0"
							style={{
								fontSize: "0.875rem",
								lineHeight: 1.5,
							}}
						>
							We've sent a 6-digit code to{" "}
							<strong>{email}</strong>.{" "}
							<button
								type="button"
								className="text-(--color-primary) border-none bg-none cursor-pointer font-medium p-0"
								style={{ fontSize: "0.875rem" }}
								onClick={() => {
									setOtp("");
									setError("");
									setSuccessMsg("");
									setView("forgot-email");
								}}
							>
								Change email
							</button>
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
								className="btn btn-primary w-full py-2.5 px-4 mt-1"
								disabled={isLoading || otp.length !== 6}
								style={{
									fontSize: "0.875rem",
								}}
							>
								{isLoading ? "Verifying..." : "Verify Code"}
							</button>
						</form>
					)}

					{/* FORGOT PASSWORD - SUCCESS VIEW */}
					{view === "forgot-success" && (
						<div className="flex flex-col gap-5 items-center" >
							<div className="text-(--color-success)">
								<CheckCircle size={48} />
							</div>
							<h2 className="font-medium m-0 text-2xl" >
								Verification Successful!
							</h2>
							<p
								className="text-(--color-text-secondary) text-center m-2.5"
								style={{ fontSize: "0.875rem" }}
							>
								You are safely authenticated. Would you like to
								set a new password or continue directly to your
								dashboard?
							</p>

							<div className="flex flex-col gap-3 w-full" >
								<button
									onClick={() => navigate(getFirstAllowedRoute(useAuthStore.getState().user))}
									className="btn btn-primary w-full py-2.5 px-4"
									style={{ fontSize: "0.875rem" }}
								>
									Continue to Dashboard
								</button>
								<button
									onClick={() => setView("change-password")}
									className="btn btn-outline w-full py-2.5 px-4 bg-transparent border border-(--color-border) text-(--color-text-primary)"
									style={{ fontSize: "0.875rem" }}
								>
									Update Password
								</button>
							</div>
						</div>
					)}

					{/* CHANGE PASSWORD VIEW */}
					{view === "change-password" && (
						<form
							onSubmit={handleChangePasswordSubmit}
							className="flex flex-col gap-5"
						>
							<p
								className="text-(--color-text-secondary) m-0"
								style={{
									fontSize: "0.875rem",
									lineHeight: 1.5,
								}}
							>
								Please create a new password for your account.
							</p>
							<div>
								<label
									className="block font-medium mb-1.5 text-(--color-text-secondary)"
									style={{ fontSize: "0.8125rem" }}
								>
									New Password
								</label>
								<div className="relative">
									<input
										type={showPw ? "text" : "password"}
										className="input pr-10"
										value={newPassword}
										onChange={(e) =>
											setNewPassword(e.target.value)
										}
										placeholder="Enter new password"
										required
										minLength={6}
										autoFocus
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
								disabled={isLoading || newPassword.length < 6}
								style={{
									fontSize: "0.875rem",
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
					className="text-center mt-5 text-(--color-text-secondary)"
					style={{ fontSize: "0.8125rem" }}
				>
					New to FlowDesk?{" "}
					<Link
						to="/register"
						className="text-(--color-primary) font-medium decoration-0"
					>
						Register here
					</Link>
				</div>
			</div>
		</div>
		
	);
};

export default LoginPage;