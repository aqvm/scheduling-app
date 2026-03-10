type JoinCampaignDialogProps = {
  isOpen: boolean;
  nameInput: string;
  inviteCodeInput: string;
  error: string;
  isJoining: boolean;
  defaultNamePlaceholder: string;
  onChangeNameInput: (value: string) => void;
  onChangeInviteCodeInput: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
};

export function JoinCampaignDialog({
  isOpen,
  nameInput,
  inviteCodeInput,
  error,
  isJoining,
  defaultNamePlaceholder,
  onChangeNameInput,
  onChangeInviteCodeInput,
  onSubmit,
  onClose
}: JoinCampaignDialogProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="join-campaign-title">
        <h2 id="join-campaign-title">Join Campaign</h2>
        <form
          className="modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <label className="month-picker" htmlFor="join-campaign-name-input">
            Your Display Name
            <input
              id="join-campaign-name-input"
              type="text"
              value={nameInput}
              onChange={(event) => onChangeNameInput(event.target.value)}
              autoComplete="nickname"
              spellCheck={false}
              placeholder={defaultNamePlaceholder}
              maxLength={64}
            />
          </label>
          <label className="month-picker" htmlFor="join-campaign-code-input">
            Campaign Invite Code
            <input
              id="join-campaign-code-input"
              type="text"
              value={inviteCodeInput}
              onChange={(event) => onChangeInviteCodeInput(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="XXXX-XXXX-XXXX"
              maxLength={32}
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="modal-actions">
            <button type="submit" className="primary-button" disabled={isJoining}>
              {isJoining ? 'Joining...' : 'Join Campaign'}
            </button>
            <button type="button" className="ghost-button" onClick={onClose} disabled={isJoining}>
              Cancel
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
