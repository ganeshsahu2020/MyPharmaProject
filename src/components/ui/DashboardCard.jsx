const DashboardCard = ({title,children}) => {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="text-lg font-medium mb-2">{title}</h3>
      {children}
    </div>
  );
};

export default DashboardCard;
