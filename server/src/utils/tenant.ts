import User from '../models/User';

export const getTenantUserIds = async (reqUser: any): Promise<string[]> => {
    const tenantId = (reqUser.tenantId?._id || reqUser.tenantId).toString();
    const users = await User.find({ tenantId }).distinct('_id');
    return users.map((id: any) => id.toString());
};

export const getTenantId = (reqUser: any): string => {
    return (reqUser.tenantId?._id || reqUser.tenantId).toString();
};
