import type { Campaign } from '../../../shared/scheduler/types';

type CampaignSelectorProps = {
  selectedCampaignId: string;
  campaigns: Campaign[];
  onChangeSelectedCampaignId: (campaignId: string) => void;
};

export function CampaignSelector({
  selectedCampaignId,
  campaigns,
  onChangeSelectedCampaignId
}: CampaignSelectorProps) {
  return (
    <label className="month-picker" htmlFor="campaign-select">
      Campaign
      <select
        id="campaign-select"
        value={selectedCampaignId}
        onChange={(event) => onChangeSelectedCampaignId(event.target.value)}
        disabled={campaigns.length === 0}
      >
        {campaigns.length === 0 ? (
          <option value="">No Campaigns</option>
        ) : (
          campaigns.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {campaign.name}
            </option>
          ))
        )}
      </select>
    </label>
  );
}
