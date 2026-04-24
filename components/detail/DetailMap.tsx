import { Loader } from "@texturehq/edges";

interface DetailMapProps {
  loading?: boolean;
  children?: React.ReactNode;
}

export function DetailMap({ loading = false, children }: DetailMapProps) {
  return (
    <div className="detail-map-wrap">
      <div className="detail-map-inner">
        {loading ? (
          <div className="detail-map-loader">
            <Loader size={28} />
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
