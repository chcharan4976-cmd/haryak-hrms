export default function OrganizationLoading() {
  return (
    <div className="p-6 animate-pulse space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <div className="h-8 w-64 bg-gray-200 rounded mb-2"></div>
          <div className="h-4 w-48 bg-gray-200 rounded"></div>
        </div>
        <div className="h-10 w-32 bg-gray-200 rounded"></div>
      </div>
      
      <div className="bg-white border border-gray-200 rounded-lg h-96">
        <div className="flex px-4 border-b border-gray-200">
          <div className="h-12 w-24 bg-gray-100 rounded-t-md mx-2"></div>
          <div className="h-12 w-24 bg-gray-100 rounded-t-md mx-2"></div>
          <div className="h-12 w-24 bg-gray-100 rounded-t-md mx-2"></div>
        </div>
        <div className="p-6 space-y-4">
          <div className="h-10 w-64 bg-gray-200 rounded"></div>
          <div className="h-8 w-full bg-gray-200 rounded mt-4"></div>
          <div className="h-12 w-full bg-gray-100 rounded"></div>
          <div className="h-12 w-full bg-gray-100 rounded"></div>
          <div className="h-12 w-full bg-gray-100 rounded"></div>
        </div>
      </div>
    </div>
  );
}
