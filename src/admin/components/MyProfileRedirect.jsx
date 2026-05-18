import React, { useEffect } from 'react';
import { useCurrentAdmin } from 'adminjs';
import { Box, Loader } from '@adminjs/design-system';

export default function MyProfileRedirect() {
  const [currentAdmin] = useCurrentAdmin();

  useEffect(() => {
    if (currentAdmin && currentAdmin.id) {
      window.location.href = `/admin/resources/User/records/${currentAdmin.id}/edit`;
    }
  }, [currentAdmin]);

  return (
    <Box flex flexDirection="column" alignItems="center" justifyContent="center" height="100%">
      <Loader />
    </Box>
  );
}
