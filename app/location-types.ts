export type LocationProposal = {
  id: string;
  treeId: string;
  contributorName: string;
  latitude: number;
  longitude: number;
  coordinateSystem: "WGS84";
  accuracyM: number | null;
  captureMethod: "device_gps" | "manual_coordinates" | "map_pin";
  locationDescription: string;
  status: "pending" | "community_verified" | "accepted" | "rejected";
  confirmationCount: number;
  createdAt: string;
  confirmationNames: string[];
  viewerConfirmed: boolean;
  viewerOwns: boolean;
};

export type VerifiedLocation = Pick<
  LocationProposal,
  | "id"
  | "treeId"
  | "latitude"
  | "longitude"
  | "status"
  | "confirmationCount"
  | "contributorName"
>;

export type LocationListResponse = {
  proposals?: LocationProposal[];
  locations?: VerifiedLocation[];
  error?: string;
};
