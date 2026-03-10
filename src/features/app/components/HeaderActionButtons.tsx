type HeaderActionButtonsProps = {
  showNameChangeButton: boolean;
  canRequestNameChange: boolean;
  isSubmittingNameChangeRequest: boolean;
  onJoinCampaign: () => void;
  onRequestNameChange: () => void;
};

export function HeaderActionButtons({
  showNameChangeButton,
  canRequestNameChange,
  isSubmittingNameChangeRequest,
  onJoinCampaign,
  onRequestNameChange
}: HeaderActionButtonsProps) {
  return (
    <div className="header-action-buttons">
      <button type="button" className="primary-button" onClick={onJoinCampaign}>
        Join Campaign
      </button>
      {showNameChangeButton ? (
        <button
          type="button"
          className="ghost-button"
          disabled={isSubmittingNameChangeRequest || !canRequestNameChange}
          onClick={onRequestNameChange}
        >
          Request Name Change
        </button>
      ) : null}
    </div>
  );
}
