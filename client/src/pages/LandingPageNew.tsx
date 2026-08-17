// import React from "react";
// import { ArrowUpRight } from "lucide-react";

const topClouds = [15, 12.5, 16, 18, 12, 15, 15, 15, 12.5, 16, 18, 12, 15, 15];
const bottomClouds = [
	15, 15, 12, 18, 16, 12.5, 15, 15, 12.5, 16, 18, 12, 15, 15,
];
// const topCloudsSS = [20, 17.5, 21, 23, 17, 20, 20, 20, 17.5];
// const bottomCloudsSS = [20, 20, 17, 23, 21, 17.5, 20, 20, 17.5];

function CloudLayer({
	clouds,
	position,
}: {
	clouds: number[];
	position: "top" | "bottom";
}) {
	return (
		<div
			style={{
				position: "absolute",
				left: 0,
				right: 0,
				display: "flex",
				pointerEvents: "none",
				justifyContent: "space-between",
				...(position === "top"
					? { top: "-4vw", alignItems: "flex-start" }
					: { bottom: "-6vw", alignItems: "flex-end" }),
			}}
		>
			{clouds.map((height, index) => (
				<div
					key={index}
					style={{
						height: `${height}vw`,
						minWidth: "8.5vw",
						flex: 1,
						borderRadius: "9999px",
						backgroundColor: "white",
						filter: "blur(3vw)",
						marginLeft: index !== 0 ? "-5vw" : "0",
					}}
				/>
			))}
		</div>
	);
}

const LandingPageNew = () => {
	return (
		<>
			<div className="relative h-[75dvh] md:h-[90dvh] md:min-h-180 w-full overflow-hidden bg-white">
				{/* Grid */}
				<div className="flex sm:hidden h-full w-full">
					{Array.from({ length: 7 }).map((_, index) => (
						<div
							key={index}
							className="w-1/7 bg-linear-to-r from-[#a87ef7] via-[#a08afacb] to-[#a87ef7ab] opacity-75 hover:opacity-100 transition-opacity duration-100 hover:scale-105 "
						/>
					))}
				</div>
				<div className="sm:flex hidden h-full w-full">
					{Array.from({ length: 24 }).map((_, index) => (
						<div
							key={index}
							className="w-1/12 bg-linear-to-r from-[#a87ef7] via-[#a08afacb] to-[#a87ef7ab] opacity-75"
							// className="w-1/12 bg-linear-to-r from-[#a87ef7] via-[#a08afacb] to-[#a87ef7ab] opacity-75
							// hover:opacity-100 transition-opacity duration-100 hover:scale-105 "
						/>
					))}
				</div>

				{/* headings */}
				<div className="flex flex-col items-center justify-center absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center w-full  px-5 md:px-0">
					<h1 className="text-5xl md:text-6xl font-manrope-bold text-[#0a0038]/75 mt-40 sm:mt-2 w-full">
						The Easiest Way to <br className="hidden sm:block" />
						Manage Your Workflows
						{/* Let's Keep It Simple */}
					</h1>
					<p className="text-md md:text-lg font-manrope-light text-[#0a0038]/75 mt-4 max-w-2xl">
						FlowDesk is the unified workspace where strategy meets
						execution. Manage Projects, track tasks, and scale your
						team with precision.
					</p>
					{/* <p className="text-lg text-[#0a0038]/75 mt-4">
				Streamline your projects and tasks to boost productivity within your organization. Try FlowDesk for free and experience the difference!
			</p> */}
					<div className="h-10">{/* empty space for spacing */}</div>
				</div>

				{/* Clouds big screens */}
				<span className="hidden sm:block">
					<CloudLayer clouds={topClouds} position="top" />
				</span>
				<span className="hidden sm:block">
					<CloudLayer clouds={bottomClouds} position="bottom" />
				</span>
				{/* Clouds small screens
                <span className="sm:hidden block">
                <CloudLayer clouds={topCloudsSS} position="top" />
                </span>
                <span className="sm:hidden block">
                <CloudLayer clouds={bottomCloudsSS} position="bottom" />
                </span> */}
			</div>

			{/* dashboard screen */}
			<div className="sm:relative h-fit sm:h-[60dvh] md:h-[70dvh] w-full bg-white pointer-events-none py-10 sm:py-0">
				<img
					src="/dashboard.png"
					alt="FlowDesk Dashboard Image"
					className="sm:block hidden rounded-2xl border-5 sm:border-10 md:border-20 border-[#ffffff]/30 sm:absolute left-1/2 transform sm:-translate-x-1/2 sm:-translate-y-2/6 w-[90dvw] sm:w-[80vw] md:w-[75vw] mx-auto shadow-2xl shadow-[#a87ef7]"
				/>
				<img
					src="/dashboardMobile.png"
					alt="FlowDesk Dashboard Image"
					className="block sm:hidden rounded-2xl border-5 sm:border-10 md:border-20 border-[#ffffff]/30 sm:absolute left-1/2 transform sm:-translate-x-1/2 sm:-translate-y-2/6 w-[90dvw] sm:w-[80vw] md:w-[75vw] mx-auto shadow-2xl shadow-[#a87ef7]"
				/>
			</div>

			{/* website content wrapper */}
			{/* <div className="w-[75vw] mx-auto h-[10dvh] "> */}
			{/* <div className="h-dvh flex items-center justify-center gap-20">
            <div className="left h-full w-1/2 flex ">
                <h1 className="font-manrope-bold text-4xl text-[#3d316a]">
                Clear Visualization of Your Workflow and Projects
                </h1>
            </div>
            <div className="right h-full w-1/2 flex items-center justify-center">
                <div className="bg-gray-200  border-2 border-dashed rounded-xl w-full h-full flex items-center justify-center">
                <span className="text-gray-500">Dashboard Image</span>
                </div>
            </div>
        </div> */}
			{/* </div> */}
			{/* <Release /> */}
			{/* <Footer /> */}
		</>
	);
};

export default LandingPageNew;
