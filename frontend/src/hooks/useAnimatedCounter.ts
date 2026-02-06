import { useEffect, useState } from "react";

/**
 * Hook that animates a number from 0 to the target value
 *
 * Uses cubic ease-out for smooth deceleration animation.
 *
 * @param targetValue - The final value to animate to
 * @param duration - Animation duration in milliseconds (default: 1000)
 * @returns The current animated value
 *
 * @example
 * ```tsx
 * const animatedScore = useAnimatedCounter(75, 800);
 * return <span>{animatedScore.toFixed(1)}</span>;
 * ```
 */
export function useAnimatedCounter(
	targetValue: number,
	duration = 1000,
): number {
	const [count, setCount] = useState(0);

	useEffect(() => {
		let startTime: number | null = null;
		let animationFrame: number;

		const animate = (timestamp: number) => {
			if (!startTime) startTime = timestamp;
			const progress = Math.min((timestamp - startTime) / duration, 1);
			// Cubic ease-out: 1 - (1 - x)^3
			const easeOut = 1 - Math.pow(1 - progress, 3);
			setCount(Math.round(easeOut * targetValue * 10) / 10);

			if (progress < 1) {
				animationFrame = requestAnimationFrame(animate);
			}
		};

		animationFrame = requestAnimationFrame(animate);
		return () => cancelAnimationFrame(animationFrame);
	}, [targetValue, duration]);

	return count;
}
