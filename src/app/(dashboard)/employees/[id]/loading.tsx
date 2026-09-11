export default function EmployeeProfileLoading() {
  return (
    <div className="p-6 animate-pulse">
      <div className="h-4 w-32 bg-gray-200 rounded mb-4"></div>
      
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-6">
        <div className="h-24 bg-gray-300"></div>
        <div className="px-6 pb-6 relative">
          <div className="flex justify-between items-end">
            <div className="flex items-center -mt-12 relative z-10">
              <div className="w-24 h-24 rounded-full bg-gray-200 border-4 border-white"></div>
              <div className="ml-5 mt-12">
                <div className="h-6 w-48 bg-gray-200 rounded mb-2"></div>
                <div className="flex space-x-2">
                  <div className="h-4 w-24 bg-gray-200 rounded"></div>
                  <div className="h-4 w-32 bg-gray-200 rounded"></div>
                </div>
              </div>
            </div>
            <div className="flex space-x-2">
              <div className="h-9 w-24 bg-gray-200 rounded"></div>
              <div className="h-9 w-9 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-lg border border-gray-200 p-6 h-96">
        <div className="flex space-x-6 border-b border-gray-200 pb-4 mb-6">
          <div className="h-4 w-20 bg-gray-200 rounded"></div>
          <div className="h-4 w-24 bg-gray-200 rounded"></div>
          <div className="h-4 w-24 bg-gray-200 rounded"></div>
          <div className="h-4 w-20 bg-gray-200 rounded"></div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-gray-50 h-48 rounded-lg"></div>
          <div className="bg-gray-50 h-48 rounded-lg"></div>
          <div className="bg-gray-50 h-48 rounded-lg"></div>
        </div>
      </div>
    </div>
  );
}
