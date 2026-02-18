import { ArcadeEmbed } from "../packmind/productTour";
import { Modal } from "./Modal";
import { PackmindLogo } from "./PackmindLogo";

interface PackmindProductTourModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export function PackmindProductTourModal({
	isOpen,
	onClose,
}: PackmindProductTourModalProps) {
	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title="Packmind Product Tour"
			icon={<PackmindLogo className="h-4" />}
			maxWidth="max-w-6xl"
		>
			<div className="-mx-6 -mb-6">
				<ArcadeEmbed />
			</div>
		</Modal>
	);
}
