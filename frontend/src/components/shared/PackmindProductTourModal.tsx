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
			maxWidth="max-w-2xl"
		>
			<div className="space-y-4">
				<p className="text-body text-slate-300">
					See how Packmind helps teams centralize, govern, and distribute their
					engineering playbook across repositories.
				</p>
				<div className="relative rounded-lg overflow-hidden bg-slate-900/50 border border-slate-700/50">
					<iframe
						src=""
						title="Packmind Product Tour"
						className="w-full"
						style={{ height: "500px" }}
					/>
					<div className="absolute inset-0 flex items-center justify-center">
						<div className="text-center space-y-3">
							<PackmindLogo className="h-8 mx-auto" />
							<p className="text-caption text-slate-400">
								Product tour coming soon
							</p>
						</div>
					</div>
				</div>
				<div className="flex justify-end pt-2">
					<a
						href="https://packmind.com"
						target="_blank"
						rel="noopener noreferrer"
						className="btn-primary"
					>
						Explore Packmind
					</a>
				</div>
			</div>
		</Modal>
	);
}
