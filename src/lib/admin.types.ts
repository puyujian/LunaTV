export interface AdminConfig {
  ConfigSubscribtion: {
    URL: string;
    AutoUpdate: boolean;
    LastCheck: string;
  };
  ConfigFile: string;
  SiteConfig: {
    SiteName: string;
    Announcement: string;
    SearchDownstreamMaxPage: number;
    SiteInterfaceCacheTime: number;
    DoubanProxyType: string;
    DoubanProxy: string;
    DoubanImageProxyType: string;
    DoubanImageProxy: string;
    DisableYellowFilter: boolean;
    FluidSearch: boolean;
    EnableRegistration: boolean;        // 全局注册开关
    RegistrationApproval: boolean;      // 是否需要管理员审批
    MaxUsers?: number;                  // 最大用户数限制（可选）
  };
  UserConfig: {
    Users: {
      username: string;
      role: 'user' | 'admin' | 'owner';
      banned?: boolean;
      status?: 'active' | 'pending' | 'rejected';  // 用户状态
      registeredAt?: number;                       // 注册时间戳
      enabledApis?: string[]; // 优先级高于tags限制
      tags?: string[]; // 多 tags 取并集限制
    }[];
    Tags?: {
      name: string;
      enabledApis: string[];
    }[];
  };
  SourceConfig: {
    key: string;
    name: string;
    api: string;
    detail?: string;
    from: 'config' | 'custom';
    disabled?: boolean;
  }[];
  CustomCategories: {
    name?: string;
    type: 'movie' | 'tv';
    query: string;
    from: 'config' | 'custom';
    disabled?: boolean;
  }[];
  LiveConfig?: {
    key: string;
    name: string;
    url: string;  // m3u 地址
    ua?: string;
    epg?: string; // 节目单
    from: 'config' | 'custom';
    channelNumber?: number;
    disabled?: boolean;
  }[];
}

export interface AdminConfigResult {
  Role: 'owner' | 'admin';
  Config: AdminConfig;
}

// 待审核用户类型
export interface PendingUser {
  username: string;
  registeredAt: number;
  hashedPassword: string;  // 存储加密后的密码
}

// 注册响应类型
export interface RegisterResponse {
  success: boolean;
  message: string;
  needsApproval?: boolean;
}

// 注册统计信息
export interface RegistrationStats {
  totalUsers: number;
  maxUsers?: number;
  pendingUsers: number;
  todayRegistrations: number;
}
